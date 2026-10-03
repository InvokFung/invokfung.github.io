// Local Arena: the real authoritative server (@arena/core), bots included, running in a
// Web Worker. The page talks to it with the same protocol it would use over a WebSocket,
// and the worker validates those messages exactly like the Node server does.
import { ArenaServer, LocalSessions, MemoryEventStore, systemScheduler, type Connection, type EventStore, type Logger } from "@arena/core";
import type { ServerMessage } from "@arena/protocol";
import { IdbEventStore } from "./idb-store";

interface WorkerScope {
  postMessage(msg: ServerMessage): void;
  addEventListener(type: "message", fn: (e: MessageEvent<unknown>) => void): void;
}
const scope = globalThis as unknown as WorkerScope;

const page: Connection = {
  id: "page",
  send: (f) => scope.postMessage(f.message),
  close: () => {},
};

// Problems surface in the devtools console of the page; routine info stays quiet.
const logger: Logger = {
  info() {},
  warn: (msg, fields) => console.warn(`[arena] ${msg}`, fields ?? ""),
  error: (msg, fields) => console.error(`[arena] ${msg}`, fields ?? ""),
};

async function boot(): Promise<ArenaServer> {
  let store: EventStore;
  try {
    store = await IdbEventStore.open();
  } catch {
    store = new MemoryEventStore(); // private mode or storage disabled
  }
  const arena = new ArenaServer({
    store,
    scheduler: systemScheduler({ setTimeout, clearTimeout, performance }),
    random: { bytes: (n) => crypto.getRandomValues(new Uint8Array(n)) },
    sessions: new LocalSessions(),
    logger,
    config: {
      server: { kind: "worker", version: "0.1.0", instance: "this tab" },
      queue: { tickMs: 200, tableSize: 4, fillAfterMs: 0, botFillAfterMs: 900, botFillCount: 2 },
    },
  });
  await arena.start();
  arena.connect(page);
  return arena;
}

const ready = boot();
scope.addEventListener("message", (e) => {
  void ready.then((arena) => arena.receive(page, e.data));
});
