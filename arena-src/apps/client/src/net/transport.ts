import type { ClientMessage, ServerMessage } from "@arena/protocol";

export type LinkStatus = "connecting" | "open" | "reconnecting" | "closed";

/**
 * The client talks to "a server" through this interface and does not care which:
 * a Web Worker running the arena in this tab, or a remote Node server over WebSocket.
 * Both speak exactly the same protocol.
 */
export interface Transport {
  readonly kind: "local" | "remote";
  readonly label: string;
  /**
   * Routing key for the load balancer (the room code). A remote transport reconnects
   * with ?room=<key> so every player of a room lands on the same replica.
   */
  route(key: string | null): void;
  send(msg: ClientMessage): void;
  onMessage(fn: (msg: ServerMessage) => void): () => void;
  onStatus(fn: (status: LinkStatus) => void): () => void;
  close(): void;
}

class Emitter<T> {
  private readonly fns = new Set<(v: T) => void>();
  on(fn: (v: T) => void): () => void {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }
  emit(v: T): void {
    for (const fn of this.fns) fn(v);
  }
}

/** Local Arena: the authoritative server, bots and event store run in a Web Worker. */
export class WorkerTransport implements Transport {
  readonly kind = "local";
  readonly label = "Local Arena · Web Worker";
  private readonly worker: Worker;
  private readonly messages = new Emitter<ServerMessage>();
  private readonly status = new Emitter<LinkStatus>();

  route(): void {
    // One "replica" in a tab: nothing to route.
  }

  constructor() {
    this.worker = new Worker(new URL("./arena.worker.ts", import.meta.url), { type: "module", name: "arena" });
    this.worker.onmessage = (e: MessageEvent<ServerMessage>) => this.messages.emit(e.data);
    this.worker.onerror = () => this.status.emit("closed");
    queueMicrotask(() => this.status.emit("open"));
  }

  send(msg: ClientMessage): void {
    this.worker.postMessage(msg);
  }
  onMessage(fn: (msg: ServerMessage) => void) {
    return this.messages.on(fn);
  }
  onStatus(fn: (status: LinkStatus) => void) {
    return this.status.on(fn);
  }
  close(): void {
    this.worker.terminate();
    this.status.emit("closed");
  }
}

/** Remote server over WebSocket, reconnecting with capped exponential backoff and jitter. */
export class SocketTransport implements Transport {
  readonly kind = "remote";
  readonly label: string;
  private ws: WebSocket | null = null;
  private readonly messages = new Emitter<ServerMessage>();
  private readonly status = new Emitter<LinkStatus>();
  private attempt = 0;
  private closed = false;
  private retryTimer: number | null = null;
  private readonly outbox: string[] = [];
  private routeKey: string | null = null;

  constructor(readonly url: string) {
    this.label = url.replace(/^wss?:\/\//, "");
    this.open();
  }

  route(key: string | null): void {
    if (key === this.routeKey) return;
    this.routeKey = key;
    const old = this.ws;
    this.ws = null;
    old?.close(1000, "rerouting");
    this.attempt = 0;
    this.open();
  }

  private open(): void {
    this.status.emit(this.attempt === 0 ? "connecting" : "reconnecting");
    const u = new URL(this.url);
    if (this.routeKey) u.searchParams.set("room", this.routeKey);
    const ws = new WebSocket(u.toString());
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.status.emit("open");
      for (const m of this.outbox.splice(0)) ws.send(m);
    };
    ws.onmessage = (e: MessageEvent<string>) => {
      if (this.ws !== ws) return; // a socket we already replaced (reroute)
      try {
        this.messages.emit(JSON.parse(e.data) as ServerMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closed || e.code === 4400 || e.code === 4001) {
        this.status.emit("closed");
        return;
      }
      const delay = Math.min(10_000, 400 * 2 ** this.attempt++) * (0.6 + Math.random() * 0.8);
      this.status.emit("reconnecting");
      this.retryTimer = window.setTimeout(() => this.open(), delay);
    };
  }

  send(msg: ClientMessage): void {
    const text = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(text);
    else if (msg.type !== "focus" && msg.type !== "ping") this.outbox.push(text);
  }
  onMessage(fn: (msg: ServerMessage) => void) {
    return this.messages.on(fn);
  }
  onStatus(fn: (status: LinkStatus) => void) {
    return this.status.on(fn);
  }
  close(): void {
    this.closed = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.ws?.close(1000, "bye");
    this.status.emit("closed");
  }
}
