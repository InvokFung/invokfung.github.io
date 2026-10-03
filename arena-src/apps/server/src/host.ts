import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { ArenaServer, DEFAULT_CONFIG, MemoryEventStore, systemScheduler, type ArenaConfig, type Connection, type EventStore, type Logger } from "@arena/core";
import { PROTOCOL_VERSION } from "@arena/protocol";
import { HmacSessions } from "./hmac-sessions";

export interface HostOptions {
  readonly host?: string;
  readonly port?: number;
  readonly store?: EventStore;
  readonly sessionSecret?: string | null;
  readonly allowedOrigins?: readonly string[];
  readonly logger?: Logger;
  readonly arena?: Partial<ArenaConfig>;
}

export interface RunningHost {
  readonly arena: ArenaServer;
  readonly http: Server;
  readonly port: number;
  readonly url: string;
  readonly wsUrl: string;
  /** Flip readiness to false (for draining) without closing anything yet. */
  drain(): void;
  close(): Promise<void>;
}

const MAX_FRAME_BYTES = 4096;
const HEARTBEAT_MS = 25_000;
/** A client that cannot keep up gets disconnected instead of buffering without bound. */
const MAX_BUFFERED_BYTES = 1 << 20;

/**
 * Node host for the arena: one HTTP server for health, readiness and metrics, with the
 * WebSocket endpoint at /ws on the same port.
 */
export async function startHost(opts: HostOptions = {}): Promise<RunningHost> {
  const store = opts.store ?? new MemoryEventStore();
  const logger = opts.logger;
  const startedAt = Date.now();
  const arena = new ArenaServer({
    store,
    scheduler: systemScheduler({ setTimeout, clearTimeout, performance }),
    random: { bytes: (n) => randomBytes(n) },
    sessions: new HmacSessions(opts.sessionSecret ?? null),
    ...(logger ? { logger } : {}),
    config: { ...opts.arena, server: { ...DEFAULT_CONFIG.server, ...opts.arena?.server, kind: "node" } },
  });
  await arena.start();
  let draining = false;
  const origins = new Set(opts.allowedOrigins ?? []);

  const http = createServer((req, res) => void route(req, res));
  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method !== "GET") return reply(res, 405, { error: "method not allowed" });
    switch (path) {
      case "/healthz":
        return reply(res, 200, { status: "ok", uptimeS: Math.round((Date.now() - startedAt) / 1000) });
      case "/readyz": {
        const ok = !draining && arena.isReady() && (await store.healthy());
        return reply(res, ok ? 200 : 503, { ready: ok, store: store.kind, ...arena.stats() });
      }
      case "/metrics": {
        const mem = process.memoryUsage();
        const extra = [
          "# HELP process_resident_memory_bytes Resident set size",
          "# TYPE process_resident_memory_bytes gauge",
          `process_resident_memory_bytes ${mem.rss}`,
          "# HELP process_uptime_seconds Seconds since start",
          "# TYPE process_uptime_seconds gauge",
          `process_uptime_seconds ${Math.round((Date.now() - startedAt) / 1000)}`,
        ].join("\n");
        res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
        return void res.end(arena.metrics.registry.render() + extra + "\n");
      }
      case "/":
        return reply(res, 200, { name: "triplefind-arena", protocol: PROTOCOL_VERSION, websocket: "/ws", instance: arena.config.server.instance });
      default:
        return reply(res, 404, { error: "not found" });
    }
  }

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_FRAME_BYTES,
    perMessageDeflate: false,
  });

  http.on("upgrade", (req, socket, head) => {
    const path = (req.url ?? "").split("?")[0];
    const origin = req.headers.origin;
    if (path !== "/ws" || draining || (origins.size > 0 && (!origin || !origins.has(origin)))) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => attach(ws));
  });

  let nextId = 0;
  const alive = new WeakMap<WebSocket, boolean>();
  function attach(ws: WebSocket): void {
    const conn: Connection = {
      id: `ws${++nextId}`,
      send: (f) => {
        if (ws.readyState !== ws.OPEN) return;
        if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return ws.close(1013, "too slow");
        ws.send(f.json);
      },
      close: (code, reason) => ws.close(code, reason),
    };
    alive.set(ws, true);
    arena.connect(conn);
    ws.on("pong", () => alive.set(ws, true));
    ws.on("message", (data, isBinary) => {
      if (isBinary) return ws.close(1003, "text frames only");
      arena.receiveText(conn, data.toString());
    });
    ws.on("close", () => arena.disconnect(conn));
    ws.on("error", () => ws.terminate());
  }

  // Detect half-open sockets (laptop lid closed, mobile network switch).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  await new Promise<void>((resolve) => http.listen(opts.port ?? 8782, opts.host ?? "0.0.0.0", resolve));
  const port = (http.address() as AddressInfo).port;

  return {
    arena,
    http,
    port,
    url: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    drain: () => {
      draining = true;
    },
    close: async () => {
      draining = true;
      clearInterval(heartbeat);
      await arena.stop();
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
      http.closeAllConnections();
    },
  };
}

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
