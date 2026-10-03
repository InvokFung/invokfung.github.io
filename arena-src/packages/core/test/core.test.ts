import { test } from "node:test";
import assert from "node:assert/strict";
import { Ladder, Matchmaker, MemoryEventStore, MetricsRegistry, INITIAL_RATING } from "@arena/core";
import { checkLog, foldEvents, type MatchSummary, type Standing } from "@arena/engine";
import { makeArena, triplesOf } from "./harness";
import { sampleStream, storeContract } from "./store-contract";

storeContract("memory store", async () => new MemoryEventStore());

test("matchmaker: full tables first, then partial tables, then bot fill", () => {
  const mm = new Matchmaker();
  const policy = { tableSize: 4, fillAfterMs: 3000, botFillAfterMs: 8000 };
  for (let i = 0; i < 6; i++) mm.join({ playerId: `p${i}`, since: 1000 + i, botLevel: "adept" });
  assert.equal(mm.join({ playerId: "p0", since: 0, botLevel: "ace" }), false, "no double queueing");
  const first = mm.take(1010, policy);
  assert.deepEqual(first.map((g) => g.map((e) => e.playerId)), [["p0", "p1", "p2", "p3"]]);
  assert.deepEqual(mm.take(1004 + 2999, policy), [], "the oldest waiter (p4) has not waited 3 s yet");
  assert.deepEqual(mm.take(1004 + 3000, policy).map((g) => g.length), [2]);
  mm.join({ playerId: "solo", since: 0, botLevel: "rookie" });
  assert.deepEqual(mm.take(7999, policy), []);
  assert.deepEqual(mm.take(8000, policy)[0]!.map((e) => e.playerId), ["solo"]);
  assert.deepEqual(mm.take(1e12, { ...policy, botFillAfterMs: null }), []);
});

const st = (id: string, rank: number, kind: "human" | "bot" = "human"): Standing => ({
  playerId: id,
  name: id,
  kind,
  botLevel: kind === "bot" ? "ace" : null,
  seat: 0,
  rank,
  score: 0,
  triples: 0,
  attempts: 0,
  penalties: 0,
  flips: 0,
});
const summary = (id: string, at: number, standings: Standing[], reason: MatchSummary["reason"] = "cleared"): MatchSummary => ({
  matchId: id,
  mode: "room",
  cardCount: 9,
  reason,
  startedAt: at - 1000,
  finishedAt: at,
  standings,
});

test("ladder: Elo between equals, bot anchors, idempotence, rebuild equals live", () => {
  const ladder = new Ladder();
  const changes = ladder.apply(summary("m1", 10, [st("a", 1), st("b", 2)]));
  assert.deepEqual(changes, [
    { playerId: "a", before: INITIAL_RATING, after: INITIAL_RATING + 16 },
    { playerId: "b", before: INITIAL_RATING, after: INITIAL_RATING - 16 },
  ]);
  assert.deepEqual(ladder.apply(summary("m1", 10, [st("a", 1), st("b", 2)])), [], "applying a match twice is a no-op");
  // Losing to an ace (anchor 1400) costs little; bots are not on the table.
  const vsBot = ladder.apply(summary("m2", 20, [st("x_bot", 1, "bot"), st("c", 2)]));
  assert.equal(vsBot.length, 1);
  assert.ok(vsBot[0]!.after - vsBot[0]!.before > -10);
  assert.equal(ladder.apply(summary("m3", 30, [st("a", 1), st("b", 2)], "abandoned")).length, 0);
  assert.equal(ladder.apply(summary("m4", 40, [st("a", 1)])).length, 0, "solo games are unrated");
  // 3-way tie: nobody moves.
  const tie = ladder.apply(summary("m5", 50, [st("d", 1), st("e", 1), st("f", 1)]));
  assert.ok(tie.every((c) => c.before === c.after));
  const rebuilt = Ladder.fromSummaries([summary("m1", 10, [st("a", 1), st("b", 2)]), summary("m2", 20, [st("x_bot", 1, "bot"), st("c", 2)]), summary("m5", 50, [st("d", 1), st("e", 1), st("f", 1)])]);
  assert.deepEqual(rebuilt.entries(), ladder.entries());
  assert.ok(!ladder.entries().some((e) => e.playerId === "x_bot"));
});

test("metrics render in Prometheus text format", () => {
  const r = new MetricsRegistry();
  r.counter("x_total", "x").inc({ code: 'a"b' });
  r.gauge("g", "g", () => 3);
  const h = r.histogram("h_ms", "h", [1, 10]);
  h.observe(0.5);
  h.observe(5);
  const text = r.render();
  assert.match(text, /x_total\{code="a_b"\} 1/);
  assert.match(text, /^g 3$/m);
  assert.match(text, /h_ms_bucket\{le="1"\} 1/);
  assert.match(text, /h_ms_bucket\{le="\+Inf"\} 2/);
  assert.ok(h.quantile(0.5) <= 1);
});

test("room flow: create, join by code, host-only start, a full match, replay and ladder", async () => {
  const { player, scheduler, deck, store } = await makeArena();
  const ann = await player("Ann");
  const ben = await player("Ben");
  ann.send({ type: "create_room", cardCount: 9, maxPlayers: 2, bots: 0, botLevel: "adept" });
  const code = ann.last("room").room!.code;
  ben.send({ type: "join_room", code });
  assert.equal(ben.last("room").room!.members.length, 2);
  ben.send({ type: "start_match" });
  assert.equal(ben.last("error").code, "not_host");
  const outsider = await player("Cid");
  outsider.send({ type: "join_room", code });
  assert.equal(outsider.last("error").code, "room_full");

  ann.send({ type: "start_match" });
  const snap = ann.last("match_snapshot");
  const matchId = snap.match.matchId;
  assert.equal(snap.you, ann.last("welcome").playerId);
  assert.ok(snap.match.cards.every((c) => c.value === null), "the deal is hidden");
  ann.send({ type: "flip", matchId, card: 0 });
  assert.equal(ann.last("error").code, "not_active", "no flips during the countdown");

  await scheduler.advance(3000);
  const groups = triplesOf(await deck(matchId));
  for (const [i, g] of groups.entries()) {
    const who = i % 2 === 0 ? ann : ben;
    for (const card of g) {
      who.send({ type: "flip", matchId, card });
      await scheduler.advance(400);
    }
  }
  const done = ann.last("match_summary");
  assert.equal(done.summary.reason, "cleared");
  assert.deepEqual(done.summary.standings.map((s) => s.name), ["Ann", "Ben"]);
  assert.equal(done.ratings.length, 2);
  assert.equal(ann.last("room").room!.status, "lobby");

  // Replay: the log rebuilds exactly the result everyone saw live.
  ann.send({ type: "get_replay", matchId });
  await scheduler.advance(0);
  const replay = ann.last("replay");
  const folded = foldEvents(checkLog(replay.events));
  assert.deepEqual(folded.standings, done.summary.standings);
  const liveFinish = ann.of("match_event").find((m) => m.event.type === "match_finished")!;
  assert.deepEqual(folded.standings, liveFinish.event.type === "match_finished" ? liveFinish.event.standings : null);
  assert.equal((await store.load(matchId)).length, replay.events.length);

  ann.send({ type: "get_ladder" });
  assert.deepEqual(ann.last("ladder").entries.map((e) => e.name), ["Ann", "Ben"]);
});

test("hidden information: nothing face-down, and no seed, reaches any client before the end", async () => {
  const { player, scheduler, deck } = await makeArena();
  const ann = await player("Ann");
  const ben = await player("Ben");
  ann.send({ type: "create_room", cardCount: 12, maxPlayers: 2, bots: 0, botLevel: "adept" });
  ben.send({ type: "join_room", code: ann.last("room").room!.code });
  ann.send({ type: "start_match" });
  const matchId = ann.last("match_snapshot").match.matchId;
  await scheduler.advance(3000);
  const watcher = await player("Spy");
  const d = await deck(matchId);
  const [a0, a1] = triplesOf(d)[0]!;
  const [b0] = triplesOf(d)[1]!;
  ann.send({ type: "flip", matchId, card: a0! });
  ann.send({ type: "flip", matchId, card: a1! });
  ann.send({ type: "flip", matchId, card: b0! }); // mismatch, shown for 800 ms
  await scheduler.advance(900);
  watcher.send({ type: "spectate", matchId });
  ben.drop();
  const ben2 = await player("Ben", ben.last("welcome").token);
  for (const snap of [watcher.last("match_snapshot"), ben2.last("match_snapshot")]) {
    assert.equal(snap.match.seed, null);
    assert.ok(snap.match.cards.every((c) => c.value === null), "flipped-back cards are not re-sent to a spectator or a reconnecting player");
    assert.ok(snap.match.cards[a0!]!.seen);
  }
  // The full log contains the seed: it must not be fetchable while live.
  watcher.send({ type: "get_replay", matchId });
  await scheduler.advance(0);
  assert.equal(watcher.last("error").code, "match_not_finished");

  const shown = (c: typeof ann) => new Set(c.of("match_event").flatMap((m) => (m.event.type === "card_flipped" ? [m.event.card] : [])));
  assert.deepEqual([...shown(ann)].sort(), [a0, a1, b0].sort(), "players see exactly the reveals that happened");
  assert.equal(shown(watcher).size + shown(ben2).size, 0);
  for (const c of [ann, ben, ben2, watcher]) assert.ok(!/"seed":"[0-9a-f]{32}"/.test(JSON.stringify(c.inbox)), "seed leaked");
});

test("cheating attempts are refused", async () => {
  const { player, client, scheduler, deck } = await makeArena();
  const ann = await player("Ann");
  const eve = await player("Eve");
  ann.send({ type: "create_room", cardCount: 9, maxPlayers: 2, bots: 1, botLevel: "rookie" });
  ann.send({ type: "start_match" });
  const matchId = ann.last("match_snapshot").match.matchId;
  await scheduler.advance(3000);
  const d = await deck(matchId);

  eve.send({ type: "flip", matchId, card: 0 });
  assert.equal(eve.last("error").code, "not_a_player", "outsiders cannot flip");
  eve.send({ type: "spectate", matchId });
  eve.send({ type: "flip", matchId, card: 0, ref: 7 });
  assert.deepEqual([eve.last("error").code, eve.last("error").ref], ["not_a_player", 7], "spectators cannot flip");
  eve.send({ type: "flip", matchId, card: 0, playerId: ann.last("welcome").playerId } as Record<string, unknown>);
  assert.equal(eve.last("error").code, "bad_message", "identity is never taken from the payload");

  ann.send({ type: "flip", matchId, card: 99 });
  assert.equal(ann.last("error").code, "bad_card");
  ann.send({ type: "flip", matchId, card: -1 });
  assert.equal(ann.last("error").code, "bad_message");
  const [x0, x1] = triplesOf(d)[0]!;
  const [y0, y1] = triplesOf(d)[1]!;
  ann.send({ type: "flip", matchId, card: x0! });
  ann.send({ type: "flip", matchId, card: x0! });
  assert.equal(ann.last("error").code, "card_unavailable");
  ann.send({ type: "flip", matchId, card: x1! });
  ann.send({ type: "flip", matchId, card: y0! });
  ann.send({ type: "flip", matchId, card: y1! });
  assert.equal(ann.last("error").code, "resolving", "no flipping through the mismatch reveal");

  const raw = client();
  raw.send({ type: "list_live" });
  assert.equal(raw.last("error").code, "hello_required");
  raw.send({ type: "hello", protocol: 999, name: "Old" });
  assert.equal(raw.last("error").code, "protocol_mismatch");
  assert.equal(raw.closed?.code, 4400);

  const spam = await player("Spam");
  for (let i = 0; i < 80; i++) spam.send({ type: "ping", t: i });
  assert.ok(spam.of("error").some((e) => e.code === "rate_limited"));
  assert.equal(spam.closed?.code, 4008, "persistent flooding disconnects");
});

test("reconnect mid-match resumes the same seat with the current state", async () => {
  const { player, scheduler, deck } = await makeArena();
  const ann = await player("Ann");
  const ben = await player("Ben");
  ann.send({ type: "create_room", cardCount: 9, maxPlayers: 2, bots: 0, botLevel: "adept" });
  ben.send({ type: "join_room", code: ann.last("room").room!.code });
  ann.send({ type: "start_match" });
  const matchId = ann.last("match_snapshot").match.matchId;
  await scheduler.advance(3000);
  const [g0, g1] = triplesOf(await deck(matchId));
  for (const c of g0!) ann.send({ type: "flip", matchId, card: c });
  const token = ann.last("welcome").token;
  const annId = ann.last("welcome").playerId;
  ann.drop();
  assert.ok(ben.of("presence").some((p) => p.playerId === annId && !p.connected), "opponents see the disconnect");
  for (const c of g1!) ben.send({ type: "flip", matchId, card: c });
  await scheduler.advance(5000);

  const back = await player("Ann", token);
  assert.equal(back.last("welcome").playerId, annId);
  const snap = back.last("match_snapshot");
  assert.equal(snap.you, annId);
  assert.deepEqual(snap.match.players.map((p) => p.triples), [1, 1]);
  assert.equal(snap.match.cards.filter((c) => c.status === "claimed").length, 6);
  const [g2] = triplesOf(await deck(matchId)).slice(2);
  for (const c of g2!) back.send({ type: "flip", matchId, card: c });
  await scheduler.advance(0); // the summary follows once the log is durable
  assert.equal(back.last("match_summary").summary.standings[0]!.playerId, annId);
});

test("quick match: a lone player gets bots; bots play the match to the end through the protocol", async () => {
  const { player, scheduler, store } = await makeArena({ queue: { tickMs: 250, tableSize: 4, fillAfterMs: 3000, botFillAfterMs: 2000, botFillCount: 2 } });
  const solo = await player("Solo");
  solo.send({ type: "queue_join", botLevel: "ace" });
  assert.equal(solo.last("queue").searching, true);
  await scheduler.advance(2500);
  const snap = solo.last("match_snapshot");
  assert.deepEqual(snap.match.players.map((p) => p.kind), ["human", "bot", "bot"]);
  assert.equal(snap.match.cardCount, 21);
  await scheduler.advance(200_000);
  const summary = solo.last("match_summary").summary;
  assert.equal(summary.reason, "cleared");
  assert.ok(solo.of("presence").some((p) => p.focus !== null), "bot attention is broadcast");
  const log = checkLog(await store.load(summary.matchId));
  assert.ok(log.filter((e) => e.type === "triple_claimed").length === 7);
  assert.equal(solo.last("match_summary").ratings[0]!.playerId, solo.last("welcome").playerId);
});

test("a match whose humans all leave is abandoned and stays unrated", async () => {
  const { player, scheduler } = await makeArena({ abandonAfterMs: 4000 });
  const ann = await player("Ann");
  ann.send({ type: "create_room", cardCount: 9, maxPlayers: 3, bots: 2, botLevel: "rookie" });
  ann.send({ type: "start_match" });
  const matchId = ann.last("match_snapshot").match.matchId;
  const watcher = await player("W");
  await scheduler.advance(3000);
  watcher.send({ type: "spectate", matchId });
  ann.drop();
  await scheduler.advance(3_900);
  assert.equal(watcher.of("match_summary").length, 0, "still within the grace period");
  await scheduler.advance(200);
  const s = watcher.last("match_summary");
  assert.equal(s.summary.reason, "abandoned");
  assert.deepEqual(s.ratings, []);
});

test("ladder survives a restart: rebuilt from the store it matches the live one", async () => {
  const store = new MemoryEventStore();
  for (const [i, at] of [1, 2, 3].entries()) {
    const stream = sampleStream(`m_restart00${i}`, at * 1_000_000, i % 2 ? "a" : "b");
    await store.append(stream[0]!.matchId, 0, stream);
  }
  const first = await makeArena({}, store);
  first.server.stats();
  const live = await Ladder.rebuild(store);
  const again = await Ladder.rebuild(store);
  assert.deepEqual(live.entries(), again.entries());
  assert.equal(live.entries().length, 3);
});
