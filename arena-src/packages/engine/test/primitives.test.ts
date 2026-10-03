import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  CLASSIC_RULES,
  boardShape,
  commitDeal,
  dealDeck,
  isValidCardCount,
  quickMatchCardCount,
  rngFromSeed,
  sha256Hex,
  timeLimitMs,
  triplePoints,
} from "@arena/engine";

test("sha256 matches node:crypto across lengths and code points", () => {
  const samples = ["", "abc", "a".repeat(55), "a".repeat(56), "b".repeat(64), "c".repeat(1000), "héllo wörld", "三連 🃏 triples", "\u0000\u007f\u0080߿ࠀ￿"];
  for (let n = 0; n < 130; n++) samples.push("x".repeat(n));
  for (const s of samples) assert.equal(sha256Hex(s), createHash("sha256").update(s, "utf8").digest("hex"), JSON.stringify(s));
});

test("seeded rng is deterministic and roughly uniform", () => {
  const a = rngFromSeed("seed-1");
  const b = rngFromSeed("seed-1");
  const c = rngFromSeed("seed-2");
  const seqA = Array.from({ length: 50 }, () => a.next());
  assert.deepEqual(seqA, Array.from({ length: 50 }, () => b.next()));
  assert.notDeepEqual(seqA, Array.from({ length: 50 }, () => c.next()));
  const r = rngFromSeed("uniform");
  const buckets = new Array<number>(10).fill(0);
  for (let i = 0; i < 100_000; i++) buckets[r.int(10)]! += 1;
  for (const count of buckets) assert.ok(count > 9_500 && count < 10_500, `bucket ${count}`);
});

test("time limit is the original formula: floor(6 * (n/3)^2 / 1.85) + 13 seconds", () => {
  for (let n = 6; n <= 36; n += 3) {
    const original = Math.floor((6 * (((n / 3) * n) / 3)) / 1.85) + 13; // as written in triplefind/script/index.js
    assert.equal(timeLimitMs(n), original * 1000, `n=${n}`);
  }
  assert.equal(timeLimitMs(6), 25_000);
  assert.equal(timeLimitMs(18), 129_000);
});

test("triple points are time-proportional with a 500 floor below half time, rounded to 10", () => {
  const limit = 100_000;
  assert.equal(triplePoints(limit, limit), 1000);
  assert.equal(triplePoints(87_340, limit), 870);
  assert.equal(triplePoints(87_360, limit), 870);
  assert.equal(triplePoints(87_500, limit), 880); // Math.round(87.5) = 88
  assert.equal(triplePoints(50_000, limit), 500);
  assert.equal(triplePoints(49_999, limit), 500);
  assert.equal(triplePoints(1, limit), 500);
  assert.equal(triplePoints(-5, limit), 500);
});

test("card counts: multiples of 3 within the rule bounds", () => {
  assert.ok(isValidCardCount(6));
  assert.ok(isValidCardCount(36));
  for (const bad of [0, 3, 7, 39, 6.0000001, Number.NaN]) assert.ok(!isValidCardCount(bad), String(bad));
  assert.equal(CLASSIC_RULES.cards.min, 6);
  assert.deepEqual([2, 3, 4].map(quickMatchCardCount), [18, 21, 24]);
});

test("board shape follows the original near-square layout", () => {
  assert.deepEqual(boardShape(9), { columns: 3, rows: 3 });
  assert.deepEqual(boardShape(12), { columns: 3, rows: 4 });
  assert.deepEqual(boardShape(18), { columns: 4, rows: 5 });
  assert.deepEqual(boardShape(24), { columns: 5, rows: 5 });
  assert.deepEqual(boardShape(36), { columns: 6, rows: 6 });
});

test("dealing is deterministic per seed, holds each value exactly three times", () => {
  const seed = "0123456789abcdef0123456789abcdef";
  const deck = dealDeck(seed, 24);
  assert.deepEqual(deck, dealDeck(seed, 24));
  assert.notDeepEqual(deck, dealDeck("f".repeat(32), 24));
  const counts = new Map<number, number>();
  for (const v of deck) counts.set(v, (counts.get(v) ?? 0) + 1);
  assert.equal(counts.size, 8);
  for (const c of counts.values()) assert.equal(c, 3);
  assert.equal(commitDeal(seed), sha256Hex("triplefind-arena/commit/v1:" + seed));
  assert.throws(() => dealDeck(seed, 10));
});
