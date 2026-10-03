import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { ArenaServer, LocalSessions, ManualScheduler, MemoryEventStore, type ArenaConfig, type Connection, type EventStore } from "@arena/core";
import { dealDeck, type MatchCreated } from "@arena/engine";
import type { ClientMessage, ServerMessage, ServerMessageOf, ServerMessageType } from "@arena/protocol";

export interface TestClient {
  readonly conn: Connection;
  readonly inbox: ServerMessage[];
  closed: { code: number; reason: string } | null;
  send(msg: ClientMessage | Record<string, unknown>): void;
  of<T extends ServerMessageType>(type: T): ServerMessageOf<T>[];
  last<T extends ServerMessageType>(type: T): ServerMessageOf<T>;
  drop(): void;
}

export async function makeArena(config: Partial<ArenaConfig> = {}, store: EventStore = new MemoryEventStore()) {
  const scheduler = new ManualScheduler();
  const server = new ArenaServer({ store, scheduler, random: { bytes: (n) => randomBytes(n) }, sessions: new LocalSessions(), config });
  await server.start();
  let n = 0;

  function client(): TestClient {
    const inbox: ServerMessage[] = [];
    const c: TestClient = {
      conn: {
        id: `t${++n}`,
        send: (f) => inbox.push(JSON.parse(f.json) as ServerMessage), // through JSON, like the wire
        close: (code, reason) => {
          c.closed = { code, reason };
        },
      },
      inbox,
      closed: null,
      send: (msg) => server.receive(c.conn, msg),
      of: (type) => inbox.filter((m): m is ServerMessageOf<typeof type> => m.type === type),
      last: (type) => {
        const all = c.of(type);
        assert.ok(all.length > 0, `no ${type} message; got ${inbox.map((m) => m.type).join(",")}`);
        return all[all.length - 1]!;
      },
      drop: () => server.disconnect(c.conn),
    };
    server.connect(c.conn);
    return c;
  }

  async function player(name: string, token?: string) {
    const c = client();
    c.send({ type: "hello", protocol: 1, name, ...(token ? { token } : {}) });
    await scheduler.advance(0);
    return c;
  }

  /** Test-only peek at the secret deal, read back from the event store. */
  async function deck(matchId: string): Promise<number[]> {
    const [first] = await store.load(matchId);
    assert.ok(first, "match_created not persisted yet");
    const created = first.event as MatchCreated;
    return dealDeck(created.seed, created.cardCount);
  }

  return { server, scheduler, store, client, player, deck };
}

export function triplesOf(deck: readonly number[]): number[][] {
  const groups = new Map<number, number[]>();
  deck.forEach((v, i) => groups.set(v, [...(groups.get(v) ?? []), i]));
  return [...groups.values()];
}
