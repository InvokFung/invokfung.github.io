// Behaviour every EventStore must have. Run against MemoryEventStore here, and against
// the file and MongoDB stores from apps/server/test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createMatch, finishEvent, applyEvent, type StoredEvent } from "@arena/engine";
import { ConcurrencyError, type EventStore } from "@arena/core";

export function sampleStream(matchId: string, finishedAt: number, winner = "a"): StoredEvent[] {
  const players = [
    { id: "p_aaaaaaaa" + winner, name: "A", kind: "human" as const, seat: 0, botLevel: null },
    { id: "p_bbbbbbbbb", name: "B", kind: "human" as const, seat: 1, botLevel: null },
  ];
  const created = createMatch({ matchId, mode: "room", seed: "ab".repeat(16), cardCount: 6, players, now: finishedAt - 30_000 });
  const started = { type: "match_started" as const, at: finishedAt - 27_000, endsAt: finishedAt - 2_000 };
  const state = applyEvent(applyEvent(null, created), started);
  const finished = finishEvent(state, "timeout", finishedAt);
  return [created, started, finished].map((event, seq) => ({ matchId, seq, event }));
}

export function storeContract(name: string, open: () => Promise<EventStore>, opts: { skip?: string | false } = {}): void {
  const t = (title: string, fn: (store: EventStore) => Promise<void>) =>
    test(`${name}: ${title}`, { skip: opts.skip ?? false }, async () => {
      const store = await open();
      try {
        await fn(store);
      } finally {
        await store.close();
      }
    });

  t("appends and loads a stream in order", async (store) => {
    const stream = sampleStream("m_contract01", 2_000_000);
    await store.append("m_contract01", 0, stream.slice(0, 1));
    await store.append("m_contract01", 1, stream.slice(1));
    assert.deepEqual(await store.load("m_contract01"), stream);
    assert.deepEqual(await store.load("m_missing0001"), []);
    assert.equal(await store.healthy(), true);
  });

  t("rejects a writer with a stale expected seq (optimistic concurrency)", async (store) => {
    const stream = sampleStream("m_contract02", 2_000_000);
    await store.append("m_contract02", 0, stream.slice(0, 2));
    await assert.rejects(store.append("m_contract02", 1, stream.slice(1, 2)), ConcurrencyError);
    await assert.rejects(store.append("m_contract03", 0, stream.slice(1, 2).map((e) => ({ ...e, matchId: "m_contract03", seq: 0 }))), RangeError);
    assert.equal((await store.load("m_contract02")).length, 2);
  });

  t("two writers racing on one stream: exactly one wins", async (store) => {
    const stream = sampleStream("m_contract04", 2_000_000);
    await store.append("m_contract04", 0, stream.slice(0, 1));
    const results = await Promise.allSettled([store.append("m_contract04", 1, stream.slice(1, 2)), store.append("m_contract04", 1, stream.slice(1, 2))]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const loser = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    assert.ok(loser?.reason instanceof ConcurrencyError);
    assert.equal((await store.load("m_contract04")).length, 2);
  });

  t("indexes finished matches for listing and projection rebuilds", async (store) => {
    for (const [id, at] of [["m_contract10", 3_000_000], ["m_contract11", 1_000_000], ["m_contract12", 2_000_000]] as const) {
      const s = sampleStream(id, at);
      await store.append(id, 0, s.slice(0, 2));
      await store.append(id, 2, s.slice(2));
    }
    const live = sampleStream("m_contract13", 9_000_000).slice(0, 2);
    await store.append("m_contract13", 0, live);
    const all = await store.allFinished();
    const ours = all.filter((s) => s.matchId.startsWith("m_contract1"));
    assert.deepEqual(ours.map((s) => s.matchId), ["m_contract11", "m_contract12", "m_contract10"]);
    const recent = (await store.recentFinished(50)).filter((s) => s.matchId.startsWith("m_contract1"));
    assert.deepEqual(recent.map((s) => s.matchId), ["m_contract10", "m_contract12", "m_contract11"]);
    assert.equal(ours[0]!.standings.length, 2);
  });
}
