import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryEventStore, type EventStore } from "@arena/core";
import { checkLog, dealDeck, foldEvents, verifyDeal, withRules, type MatchCreated } from "@arena/engine";
import { startHost, type RunningHost } from "../src/host";
import { FileEventStore } from "../src/file-store";
import { MongoEventStore } from "../src/mongo-store";
import { HmacSessions } from "../src/hmac-sessions";
import { WsTestClient } from "./ws-client";
import { storeContract } from "../../../packages/core/test/store-contract";

const FAST = withRules({ timing: { countdownMs: 150, mismatchRevealMs: 250, idleReleaseMs: 6000 } });

async function boot(store: EventStore = new MemoryEventStore(), extra: Parameters<typeof startHost>[0] = {}): Promise<RunningHost & { store: EventStore }> {
  const host = await startHost({ port: 0, host: "127.0.0.1", store, sessionSecret: "test-secret", arena: { rules: FAST }, ...extra });
  return Object.assign(host, { store });
}

async function deckOf(store: EventStore, matchId: string): Promise<number[]> {
  for (let i = 0; i < 50; i++) {
    const [first] = await store.load(matchId);
    if (first) {
      const c = first.event as MatchCreated;
      return dealDeck(c.seed, c.cardCount);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("match_created never persisted");
}

const groupsOf = (deck: number[]) => [...deck.reduce((m, v, i) => m.set(v, [...(m.get(v) ?? []), i]), new Map<number, number[]>()).values()];

async function roomOfTwo(host: RunningHost) {
  const ann = await WsTestClient.hello(host.wsUrl, "Ann");
  const ben = await WsTestClient.hello(host.wsUrl, "Ben");
  ann.send({ type: "create_room", cardCount: 9, maxPlayers: 2, bots: 0, botLevel: "adept" });
  const room = await ann.waitFor("room", (m) => m.room !== null);
  ben.send({ type: "join_room", code: room.room!.code });
  await ann.waitFor("room", (m) => m.room?.members.length === 2);
  ann.send({ type: "start_match" });
  const snap = await ann.waitFor("match_snapshot");
  await ben.waitFor("match_snapshot");
  await ann.waitFor("match_event", (m) => m.event.type === "match_started");
  return { ann, ben, matchId: snap.match.matchId };
}

test("health, readiness and Prometheus metrics endpoints", async () => {
  const host = await boot();
  try {
    assert.equal((await fetch(host.url + "/healthz")).status, 200);
    const ready = await fetch(host.url + "/readyz");
    assert.equal(ready.status, 200);
    assert.equal(((await ready.json()) as { store: string }).store, "memory");
    const metrics = await (await fetch(host.url + "/metrics")).text();
    assert.match(metrics, /# TYPE arena_flip_handle_ms histogram/);
    assert.match(metrics, /process_resident_memory_bytes \d+/);
    assert.equal((await fetch(host.url + "/nope")).status, 404);
    host.drain();
    assert.equal((await fetch(host.url + "/readyz")).status, 503, "draining pods report not-ready");
  } finally {
    await host.close();
  }
});

test("a full match over WebSockets; the replay rebuilds exactly the live result", async () => {
  const host = await boot();
  try {
    const { ann, ben, matchId } = await roomOfTwo(host);
    const groups = groupsOf(await deckOf(host.store, matchId));
    for (const [i, g] of groups.entries()) {
      const who = i === 1 ? ben : ann;
      for (const card of g) {
        who.send({ type: "flip", matchId, card });
        await who.waitFor("match_event", (m) => m.event.type === "card_flipped" && m.event.card === card);
      }
    }
    const live = await ann.waitFor("match_summary");
    assert.equal(live.summary.reason, "cleared");
    assert.deepEqual(live.summary.standings.map((s) => [s.name, s.triples]), [["Ann", 2], ["Ben", 1]]);
    assert.equal(live.ratings.find((r) => r.playerId === ann.welcome.playerId)!.after, 1216);

    // The live stream ended with the seed: the client can check the deal itself.
    const fin = (await ben.waitFor("match_event", (m) => m.event.type === "match_finished")).event;
    assert.ok(fin.type === "match_finished");
    const snap = ben.of("match_snapshot")[0]!;
    const reveals = ben.of("match_event").flatMap((m) => (m.event.type === "card_flipped" ? [[m.event.card, m.event.value] as const] : []));
    assert.ok(verifyDeal({ commitment: snap.match.commitment, seed: fin.seed, cardCount: 9, reveals }).ok);

    ben.send({ type: "get_replay", matchId });
    const replay = await ben.waitFor("replay");
    const rebuilt = foldEvents(checkLog(replay.events));
    assert.deepEqual(rebuilt.standings, live.summary.standings);
    assert.deepEqual(rebuilt.standings, fin.standings);

    ben.send({ type: "list_replays" });
    assert.equal((await ben.waitFor("replay_list")).replays[0]!.matchId, matchId);
    ann.close();
    ben.close();
  } finally {
    await host.close();
  }
});

test("cheating over the wire is refused: forged identity, spectator flips, live replay, junk frames", async () => {
  const host = await boot();
  try {
    const { ann, matchId } = await roomOfTwo(host);
    const eve = await WsTestClient.hello(host.wsUrl, "Eve");
    eve.send({ type: "spectate", matchId });
    const spySnap = await eve.waitFor("match_snapshot");
    assert.equal(spySnap.you, null);
    assert.ok(spySnap.match.cards.every((c) => c.value === null) && spySnap.match.seed === null);

    eve.send({ type: "flip", matchId, card: 0, ref: 1 });
    assert.equal((await eve.waitFor("error", (e) => e.ref === 1)).code, "not_a_player");
    eve.send({ type: "flip", matchId, card: 0, playerId: ann.welcome.playerId });
    assert.equal((await eve.waitFor("error", (e) => e.code === "bad_message")).code, "bad_message");
    eve.send({ type: "get_replay", matchId });
    assert.ok(await eve.waitFor("error", (e) => e.code === "match_not_finished"));
    eve.sendRaw("{not json");
    await eve.waitFor("error", (e) => e.message === "Malformed JSON.");

    // Forged resume tokens do not grant Ann's identity.
    const forged = new HmacSessions("some-other-secret").issue(ann.welcome.playerId);
    const mallory = await WsTestClient.hello(host.wsUrl, "Mallory", forged);
    assert.notEqual(mallory.welcome.playerId, ann.welcome.playerId);
    mallory.send({ type: "flip", matchId, card: 0 });
    assert.equal((await mallory.waitFor("error")).code, "not_a_player");

    // Oversized frames are cut off by the socket layer.
    const big = await WsTestClient.open(host.wsUrl);
    big.sendRaw(JSON.stringify({ type: "hello", protocol: 1, name: "x".repeat(10_000) }));
    assert.equal((await big.closed).code, 1009);

    for (const c of [ann, eve, mallory]) c.close();
  } finally {
    await host.close();
  }
});

test("origin allow-list rejects sockets from other sites", async () => {
  const host = await boot(new MemoryEventStore(), { allowedOrigins: ["https://invokfung.github.io"] });
  try {
    await assert.rejects(WsTestClient.open(host.wsUrl, "https://evil.example"), /403/);
    const ok = await WsTestClient.open(host.wsUrl, "https://invokfung.github.io");
    ok.close();
  } finally {
    await host.close();
  }
});

test("reconnect mid-match: a dropped socket resumes the same seat with a resume token", async () => {
  const host = await boot();
  try {
    const { ann, ben, matchId } = await roomOfTwo(host);
    const groups = groupsOf(await deckOf(host.store, matchId));
    for (const card of groups[0]!) ann.send({ type: "flip", matchId, card });
    await ben.waitFor("match_event", (m) => m.event.type === "triple_claimed");
    const { token, playerId } = ann.welcome;
    ann.terminate(); // no close handshake: like a network drop
    await ben.waitFor("presence", (p) => p.playerId === playerId && !p.connected);

    const back = await WsTestClient.hello(host.wsUrl, "Ann", token);
    assert.equal(back.welcome.playerId, playerId);
    const snap = await back.waitFor("match_snapshot");
    assert.equal(snap.you, playerId);
    assert.equal(snap.match.players.find((p) => p.id === playerId)!.triples, 1);
    await ben.waitFor("presence", (p) => p.playerId === playerId && p.connected);
    for (const g of groups.slice(1)) for (const card of g) back.send({ type: "flip", matchId, card });
    const done = await back.waitFor("match_summary");
    assert.deepEqual(done.summary.standings.map((s) => s.triples), [3, 0]);
    back.close();
    ben.close();
  } finally {
    await host.close();
  }
});

test("event sourcing across a restart: file store brings back replays and the ladder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arena-"));
  const path = join(dir, "events.jsonl");
  try {
    let host = await boot(await FileEventStore.open(path));
    const { ann, ben, matchId } = await roomOfTwo(host);
    for (const g of groupsOf(await deckOf(host.store, matchId))) for (const card of g) ann.send({ type: "flip", matchId, card });
    await ann.waitFor("match_summary");
    ann.send({ type: "get_ladder" });
    const before = (await ann.waitFor("ladder")).entries;
    const token = ann.welcome.token;
    ann.close();
    ben.close();
    await host.close();
    await host.store.close();
    await appendFile(path, '{"matchId":"m_torn'); // simulate a crash mid-write

    host = await boot(await FileEventStore.open(path));
    const again = await WsTestClient.hello(host.wsUrl, "Ann", token);
    assert.equal(again.welcome.playerId, before[0]!.playerId, "signed tokens survive a restart");
    assert.equal(again.welcome.rating, before[0]!.rating);
    again.send({ type: "get_ladder" });
    assert.deepEqual((await again.waitFor("ladder")).entries, before);
    again.send({ type: "get_replay", matchId });
    assert.equal(foldEvents(checkLog((await again.waitFor("replay")).events)).finishReason, "cleared");
    again.close();
    await host.close();
    await host.store.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

let fileN = 0;
const fileDir = await mkdtemp(join(tmpdir(), "arena-contract-"));
after(() => rm(fileDir, { recursive: true, force: true }));
storeContract("file store", () => FileEventStore.open(join(fileDir, `c${++fileN}.jsonl`)));

const mongoUrl = process.env.ARENA_TEST_MONGO_URL;
let mongoN = 0;
storeContract("mongo store", () => MongoEventStore.connect(mongoUrl ?? "", `arena_contract_${process.pid}_${++mongoN}`), {
  skip: mongoUrl ? false : "set ARENA_TEST_MONGO_URL to run against a real MongoDB",
});
