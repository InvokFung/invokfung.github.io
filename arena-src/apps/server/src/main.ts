import type { EventStore } from "@arena/core";
import { MemoryEventStore } from "@arena/core";
import { loadConfig, type ServerConfig } from "./config";
import { FileEventStore } from "./file-store";
import { startHost } from "./host";
import { jsonLogger } from "./logger";
import { MongoEventStore } from "./mongo-store";

async function openStore(cfg: ServerConfig, warn: (msg: string) => void): Promise<EventStore> {
  switch (cfg.store.kind) {
    case "memory":
      return new MemoryEventStore();
    case "file":
      return FileEventStore.open(cfg.store.path, { fsync: cfg.store.fsync, onWarn: warn });
    case "mongo":
      return MongoEventStore.connect(cfg.store.url, cfg.store.db);
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const log = jsonLogger(cfg.logLevel, { instance: cfg.instance });
  if (!cfg.sessionSecret) log.warn("ARENA_SESSION_SECRET not set: resume tokens will not survive a restart or work across replicas");
  if (cfg.allowedOrigins.length === 0) log.warn("ARENA_ALLOWED_ORIGINS not set: accepting sockets from any origin");
  const store = await openStore(cfg, (m) => log.warn(m));
  const host = await startHost({
    host: cfg.host,
    port: cfg.port,
    store,
    sessionSecret: cfg.sessionSecret,
    allowedOrigins: cfg.allowedOrigins,
    logger: log,
    arena: {
      server: { kind: "node", version: "0.1.0", instance: cfg.instance },
      queue: { tickMs: 250, tableSize: 4, fillAfterMs: cfg.fillAfterMs, botFillAfterMs: cfg.botFillAfterMs, botFillCount: 2 },
    },
  });
  log.info("listening", { port: host.port, store: store.kind, websocket: "/ws" });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info("shutting down", { signal, drainMs: cfg.drainMs });
    host.drain(); // /readyz turns 503 so the load balancer stops sending new sockets
    await new Promise((r) => setTimeout(r, cfg.drainMs));
    await host.close();
    await store.close();
    log.info("bye");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
