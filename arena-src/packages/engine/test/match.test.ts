import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOT_PROFILES,
  BotMind,
  applyEvent,
  createMatch,
  decideAbandon,
  decideClear,
  decideFlip,
  decideStalemate,
  decideStart,
  decideTimeout,
  isStalemate,
  foldEvents,
  rngFromSeed,
  toPublicView,
  verifyDeal,
  scoreTimeline,
  type MatchEvent,
  type MatchPlayerInfo,
  type MatchState,
} from "@arena/engine";

const SEED = "00112233445566778899aabbccddeeff";
const P = (id: string, seat: number): MatchPlayerInfo => ({ id, name: id.toUpperCase(), kind: "human", seat, botLevel: null });

/** Small harness: keeps the log and the folded state side by side. */
function harness(cardCount = 9, players = [P("a", 0), P("b", 1)], t0 = 1_000_000) {
  const log: MatchEvent[] = [createMatch({ matchId: "m1", mode: "room", seed: SEED, cardCount, players, now: t0 })];
  let state: MatchState = applyEvent(null, log[0]!);
  const h = {
    get state() {
      return state;
    },
    log,
    commit(events: MatchEvent[]) {
      for (const e of events) {
        log.push(e);
        state = applyEvent(state, e);
      }
      return events;
    },
    start(at = state.startsAt) {
      const d = decideStart(state, at);
      assert.ok(d.ok);
      return h.commit(d.events);
    },
    flip(player: string, card: number, at: number) {
      const d = decideFlip(state, player, card, at);
      if (!d.ok) throw new Error(d.code);
      return h.commit(d.events);
    },
    /** Indices holding `value`, from the authoritative deck. */
    cardsOf(value: number) {
      return state.cards.flatMap((c, i) => (c.value === value ? [i] : []));
    },
  };
  return h;
}

test("a claim scores by remaining time; clearing the board finishes the match", () => {
  const h = harness(6, [P("a", 0)]);
  h.start();
  const t = h.state.startedAt!;
  const [x, y, z] = h.cardsOf(0);
  h.flip("a", x!, t + 1000);
  h.flip("a", y!, t + 1500);
  const ev = h.flip("a", z!, t + 2000);
  const claim = ev.find((e) => e.type === "triple_claimed");
  assert.ok(claim && claim.type === "triple_claimed");
  // 25 s limit, 23 s left -> 0.92 -> 920
  assert.equal(claim.points, 920);
  assert.equal(h.state.players[0]!.score, 920);
  const [p, q, r] = h.cardsOf(1);
  h.flip("a", p!, t + 14_000);
  h.flip("a", q!, t + 14_100);
  const last = h.flip("a", r!, t + 14_200); // 10.8 s of 25 s left -> below half -> 500
  assert.deepEqual(last.map((e) => e.type), ["card_flipped", "triple_claimed", "match_finished"]);
  assert.equal(h.state.status, "finished");
  assert.equal(h.state.finishReason, "cleared");
  assert.equal(h.state.players[0]!.score, 1420);
  assert.equal(h.state.standings![0]!.triples, 2);
});

test("a failed triple costs 200 only when it re-flips a seen card, never below zero", () => {
  const h = harness(9, [P("a", 0)]);
  h.start();
  const t = h.state.startedAt!;
  const [a0, a1, a2] = h.cardsOf(0);
  const [b0] = h.cardsOf(1);
  const [c0] = h.cardsOf(2);

  // Fresh cards: no penalty.
  const fail1 = h.flip("a", a0!, t + 100).concat(h.flip("a", a1!, t + 200), h.flip("a", b0!, t + 300));
  assert.equal(fail1.at(-1)?.type, "triple_failed");
  assert.equal((fail1.at(-1) as Extract<MatchEvent, { type: "triple_failed" }>).penalty, 0);
  // Cannot flip while the mismatch is shown, until the server clears it.
  assert.equal(decideFlip(h.state, "a", c0!, t + 400).ok, false);
  const clear = decideClear(h.state, "a", "mismatch", t + 1100);
  assert.ok(clear.ok);
  h.commit(clear.events);
  assert.equal(h.state.cards[a0!]!.status, "down");
  assert.equal(h.state.cards[a0!]!.seen, true);

  // Score 0, reflip fail: penalty capped at the current score (0).
  h.flip("a", a0!, t + 1200);
  h.flip("a", b0!, t + 1300);
  const capped = h.flip("a", c0!, t + 1400).at(-1);
  assert.ok(capped?.type === "triple_failed" && capped.penalty === 0);
  h.commit((decideClear(h.state, "a", "mismatch", t + 2300) as { ok: true; events: MatchEvent[] }).events);

  // Earn points, then a reflip fail costs the full 200.
  h.flip("a", a0!, t + 2400);
  h.flip("a", a1!, t + 2500);
  h.flip("a", a2!, t + 2600);
  const before = h.state.players[0]!.score;
  assert.ok(before > 200);
  h.flip("a", b0!, t + 2700);
  const [b1] = h.cardsOf(1).filter((i) => i !== b0);
  h.flip("a", b1!, t + 2800);
  const fail = h.flip("a", c0!, t + 2900).at(-1);
  assert.ok(fail?.type === "triple_failed" && fail.penalty === 200);
  assert.equal(h.state.players[0]!.score, before - 200);
  assert.equal(h.state.players[0]!.penalties, 1);
});

test("illegal flips are rejected with precise codes", () => {
  const h = harness(9, [P("a", 0), P("b", 1)]);
  assert.deepEqual(decideFlip(h.state, "a", 0, h.state.startsAt - 1), { ok: false, code: "not_active" });
  h.start();
  const t = h.state.startedAt!;
  assert.deepEqual(decideFlip(h.state, "zed", 0, t), { ok: false, code: "not_a_player" });
  for (const bad of [-1, 9, 1.5, Number.NaN]) assert.deepEqual(decideFlip(h.state, "a", bad, t), { ok: false, code: "bad_card" });
  h.flip("a", 4, t + 10);
  assert.deepEqual(decideFlip(h.state, "b", 4, t + 20), { ok: false, code: "card_unavailable" }, "held by another player");
  assert.deepEqual(decideFlip(h.state, "a", 4, t + 20), { ok: false, code: "card_unavailable" }, "already up");
  assert.deepEqual(decideFlip(h.state, "b", 5, h.state.endsAt!), { ok: false, code: "time_up" });
  assert.deepEqual(decideStart(h.state, t + 30), { ok: false, code: "already_started" });
});

test("players race on one shared board; claimed cards are gone for everyone", () => {
  const h = harness(9, [P("a", 0), P("b", 1)]);
  h.start();
  const t = h.state.startedAt!;
  const [x, y, z] = h.cardsOf(2);
  h.flip("b", x!, t + 100);
  h.flip("a", y!, t + 150); // a grabs a card of the same value; b can no longer complete with it
  assert.equal(decideFlip(h.state, "b", y!, t + 160).ok, false);
  h.flip("a", h.cardsOf(0)[0]!, t + 200);
  h.flip("b", z!, t + 250);
  assert.deepEqual(h.state.players.map((p) => p.selection.length), [2, 2]);
  assert.deepEqual(decideClear(h.state, "a", "mismatch", t + 300), { ok: false, code: "resolving" }, "nothing to resolve yet");
  const idle = decideClear(h.state, "a", "idle", t + 7000);
  assert.ok(idle.ok);
  h.commit(idle.events);
  assert.equal(h.state.cards[y!]!.status, "down");
});

test("stalemate: when every unclaimed card is held, all partial selections flip back", () => {
  const h = harness(6, [P("a", 0), P("b", 1), P("c", 2)]);
  h.start();
  const t = h.state.startedAt!;
  const [x0, x1, x2] = h.cardsOf(0);
  const [y0, y1, y2] = h.cardsOf(1);
  h.flip("a", x0!, t + 1);
  h.flip("a", y0!, t + 2);
  h.flip("b", x1!, t + 3);
  h.flip("b", y1!, t + 4);
  assert.equal(isStalemate(h.state), false, "two cards are still face down");
  h.flip("c", x2!, t + 5);
  assert.equal(isStalemate(h.state), false);
  h.flip("c", y2!, t + 6);
  assert.equal(isStalemate(h.state), true, "nobody can move");
  const d = decideStalemate(h.state, t + 700);
  assert.ok(d.ok);
  assert.deepEqual(d.events.map((e) => e.type === "selection_cleared" && e.reason), ["stalemate", "stalemate", "stalemate"]);
  h.commit(d.events);
  assert.ok(h.state.cards.every((c) => c.status === "down"));
  assert.equal(decideStalemate(h.state, t + 800).ok, false);
});

test("timeout and abandon finish the match with standings", () => {
  const h = harness(9, [P("a", 0), P("b", 1)]);
  h.start();
  assert.equal(decideTimeout(h.state, h.state.endsAt! - 1).ok, false);
  const done = decideTimeout(h.state, h.state.endsAt! + 3);
  assert.ok(done.ok && done.events[0]?.type === "match_finished");
  assert.equal((done.events[0] as Extract<MatchEvent, { type: "match_finished" }>).at, h.state.endsAt, "finish is stamped at the deadline, not when the timer fired");
  const h2 = harness();
  const ab = decideAbandon(h2.state, h2.state.createdAt + 5);
  assert.ok(ab.ok);
  h2.commit(ab.events);
  assert.equal(h2.state.finishReason, "abandoned");
});

test("ties share a rank; order falls back to the earlier last claim", () => {
  const h = harness(6, [P("a", 0), P("b", 1), P("c", 2)]);
  h.start();
  const t = h.state.startedAt!;
  const [a0, a1, a2] = h.cardsOf(0);
  const [b0, b1, b2] = h.cardsOf(1);
  h.flip("b", a0!, t + 10);
  h.flip("b", a1!, t + 20);
  h.flip("b", a2!, t + 30);
  h.flip("a", b0!, t + 40);
  h.flip("a", b1!, t + 50);
  h.flip("a", b2!, t + 60); // same 1000 points, but b's last claim came first
  const st = h.state.standings!;
  assert.deepEqual(st.map((s) => [s.playerId, s.rank]), [["b", 1], ["a", 1], ["c", 3]]);
});

test("the public view never carries a face-down value or the seed while live", () => {
  const h = harness(12, [P("a", 0), P("b", 1)]);
  h.start();
  const t = h.state.startedAt!;
  const [x0, x1] = h.cardsOf(0);
  const [y0] = h.cardsOf(1);
  h.flip("a", x0!, t + 1);
  h.flip("a", x1!, t + 2);
  let v = toPublicView(h.state);
  assert.equal(v.seed, null);
  assert.equal(v.cards[x0!]!.value, 0, "face-up cards are public");
  v.cards.forEach((c) => assert.ok((c.status === "down") === (c.value === null)));
  h.flip("a", y0!, t + 3);
  const clear = decideClear(h.state, "a", "mismatch", t + 803);
  assert.ok(clear.ok);
  h.commit(clear.events);
  assert.equal(h.state.cards[x0!]!.value, 0, "the server keeps the deck");
  v = toPublicView(h.state);
  assert.equal(v.cards[x0!]!.value, null, "seen-then-hidden cards are not remembered for you");
  assert.equal(v.cards[x0!]!.seen, true);
  assert.equal(v.cards.filter((c) => c.value !== null).length, 0);
});

test("same seed + same commands = identical event log (determinism)", () => {
  const run = () => {
    const h = harness(15, [P("a", 0), P("b", 1)]);
    h.start();
    const rng = rngFromSeed("driver");
    let t = h.state.startedAt!;
    for (let i = 0; i < 400 && h.state.status === "active"; i++) {
      t += 37;
      const who = rng.pick(["a", "b"]);
      const self = h.state.players.find((p) => p.id === who)!;
      if (self.resolvingUntil !== null) {
        const d = decideClear(h.state, who, "mismatch", t);
        if (d.ok) h.commit(d.events);
        continue;
      }
      const d = decideFlip(h.state, who, rng.int(15), t);
      if (d.ok) h.commit(d.events);
    }
    return h.log;
  };
  const a = run();
  assert.deepEqual(a, run());
  assert.deepEqual(foldEvents(a), foldEvents(run()));
});

test("bots with imperfect memory finish a solo board, and the deal verifies", () => {
  for (const level of ["rookie", "adept", "ace"] as const) {
    const bot: MatchPlayerInfo = { id: "bot", name: "Bot", kind: "bot", seat: 0, botLevel: level };
    const h = harness(18, [bot]);
    h.start();
    const mind = new BotMind(BOT_PROFILES[level], rngFromSeed("bot:" + level));
    const reveals = new Map<number, number>();
    let t = h.state.startedAt!;
    while (h.state.status === "active") {
      const self = h.state.players[0]!;
      if (self.resolvingUntil !== null) {
        t = Math.max(t, self.resolvingUntil);
        const d = decideClear(h.state, "bot", "mismatch", t);
        assert.ok(d.ok);
        h.commit(d.events);
        continue;
      }
      t += mind.thinkDelay();
      const d = t >= h.state.endsAt! ? decideTimeout(h.state, t) : decideFlip(h.state, "bot", mind.chooseCard(h.state, "bot", t)!, t);
      assert.ok(d.ok, `bot made an illegal move: ${JSON.stringify(d)}`);
      for (const e of h.commit(d.events)) {
        if (e.type === "card_flipped") {
          mind.observe(e.card, e.value, e.at);
          reveals.set(e.card, e.value);
        }
        if (e.type === "triple_claimed") e.cards.forEach((c) => mind.forget(c));
      }
    }
    assert.equal(h.state.finishReason, "cleared", `${level} should clear 18 cards in ${h.state.timeLimitMs} ms`);
    const v = verifyDeal({ commitment: h.state.commitment, seed: h.state.seed!, cardCount: 18, reveals });
    assert.ok(v.ok && v.checkedReveals === 18);
    const tl = scoreTimeline(h.log).get("bot")!;
    assert.equal(tl.at(-1)!.score, h.state.players[0]!.score);
  }
});

test("a cautious bot waits while others hold its cards, but only for a while", () => {
  const h = harness(6, [P("a", 0), P("b", 1), { id: "c", name: "C", kind: "bot", seat: 2, botLevel: "ace" }]);
  h.start();
  const t = h.state.startedAt!;
  const [x0, x1, x2] = h.cardsOf(0);
  const [y0, y1, y2] = h.cardsOf(1);
  const mind = new BotMind(BOT_PROFILES.ace, rngFromSeed("patience"));
  for (const c of [x0, x1, x2, y0, y1, y2]) mind.observe(c!, h.state.cards[c!]!.value!, t); // it has seen everything
  h.flip("a", x0!, t + 10);
  h.flip("b", y0!, t + 20); // each value now has a card in someone else's hand
  assert.equal(mind.chooseCard(h.state, "c", t + 100), null, "nothing new to learn and no full triple: wait");
  assert.equal(mind.chooseCard(h.state, "c", t + 1500), null);
  const pick = mind.chooseCard(h.state, "c", t + 100 + 2600);
  assert.ok(pick !== null && [x1, x2, y1, y2].includes(pick), "after its patience runs out it opens a known pair");
});

test("verifyDeal catches a swapped card and a wrong seed", () => {
  const h = harness(9, [P("a", 0)]);
  const deck = h.state.cards.map((c) => c.value!);
  const reveals: [number, number][] = deck.map((v, i) => [i, v]);
  assert.ok(verifyDeal({ commitment: h.state.commitment, seed: SEED, cardCount: 9, reveals }).ok);
  const tampered = reveals.map(([i, v]): [number, number] => (i === 0 ? [i, (v + 1) % 3] : [i, v]));
  assert.equal(verifyDeal({ commitment: h.state.commitment, seed: SEED, cardCount: 9, reveals: tampered }).revealsMatch, false);
  assert.equal(verifyDeal({ commitment: h.state.commitment, seed: "f".repeat(32), cardCount: 9, reveals: [] }).commitmentMatches, false);
});
