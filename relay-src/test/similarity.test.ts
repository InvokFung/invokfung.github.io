import { test } from "node:test";
import assert from "node:assert/strict";
import {
  guard,
  hamming,
  jaccard,
  lshCandidateProbability,
  lshKeys,
  MINHASH_K,
  minhash,
  minhashSimilarity,
  normalizePrompt,
  ResponseCache,
  seeded,
  shingles,
  simhash,
} from "@relay/core";

test("MinHash estimates Jaccard within 3 standard errors on 200 random set pairs", () => {
  const rng = seeded(9);
  let worst = 0;
  for (let t = 0; t < 200; t++) {
    const shared = Math.floor(rng.next() * 80);
    const onlyA = Math.floor(rng.next() * 40);
    const onlyB = Math.floor(rng.next() * 40);
    const a = new Set<string>();
    const b = new Set<string>();
    for (let i = 0; i < shared; i++) a.add(`s${t}-${i}`), b.add(`s${t}-${i}`);
    for (let i = 0; i < onlyA; i++) a.add(`a${t}-${i}`);
    for (let i = 0; i < onlyB; i++) b.add(`b${t}-${i}`);
    if (!a.size || !b.size) continue;
    const j = jaccard(a, b);
    const est = minhashSimilarity(minhash(a), minhash(b));
    const se = Math.sqrt(Math.max(j * (1 - j), 0.01) / MINHASH_K);
    worst = Math.max(worst, Math.abs(est - j) / se);
    assert.ok(Math.abs(est - j) <= 3.5 * se, `trial ${t}: J=${j.toFixed(3)} est=${est.toFixed(3)}`);
  }
  assert.ok(worst > 0, "estimates are not trivially exact");
});

test("MinHash: identical sets agree on every minimum and share every LSH band", () => {
  const s = shingles(normalizePrompt("How do I reset my password?"));
  const a = minhash(s);
  const b = minhash(new Set(s));
  assert.equal(minhashSimilarity(a, b), 1);
  assert.deepEqual(lshKeys(a), lshKeys(b));
});

test("LSH banding: candidate probability is an S-curve around ~0.5", () => {
  assert.ok(lshCandidateProbability(0.2) < 0.05);
  assert.ok(lshCandidateProbability(0.8) > 0.99);
  assert.ok(Math.abs(lshCandidateProbability(0.5) - 0.64) < 0.02);
});

test("SimHash: identical texts are 0 apart, small edits close, unrelated texts far", () => {
  const sh = (t: string) => simhash(shingles(normalizePrompt(t)));
  const a = sh("How do I reset my password on the mobile app?");
  assert.equal(hamming(a, sh("How do I reset my password on the mobile app?")), 0);
  const near = hamming(a, sh("how do I reset my password on the mobile app"));
  assert.equal(near, 0, "case and punctuation are normalised away");
  const edit = hamming(a, sh("How can I reset my password on the mobile app?"));
  const far = hamming(a, sh("Summarize the incident report about the expired certificate on lb-2"));
  assert.ok(edit < far, `edit ${edit} vs unrelated ${far}`);
  assert.ok(far >= 16, `unrelated ${far}`);
});

test("normalisation drops case, punctuation and filler, keeps numbers and placeholders", () => {
  assert.deepEqual(normalizePrompt("Hi! Please, refund order 1,234 to <EMAIL_1> - thanks"), ["refund", "order", "1234", "to", "⟨email_1⟩"]);
  assert.deepEqual(normalizePrompt("What's 3.5 * 2?"), ["what's", "3.5", "2"]);
});

test("guard: rejects any difference that could change the answer", () => {
  const n = normalizePrompt;
  assert.equal(guard(n("refund order 1234"), n("refund order 5678")).ok, false, "numbers");
  assert.equal(guard(n("send it to <EMAIL_1>"), n("send it to <PHONE_1>")).ok, false, "placeholders");
  assert.equal(guard(n("can I use the API on the free plan"), n("can't I use the API on the free plan")).ok, false, "negation");
  assert.equal(guard(n("convert 5 km to miles"), n("convert 5 miles to km")).ok, false, "order of content words");
  assert.equal(guard(n("is ibuprofen safe with aspirin"), n("is ibuprofen safe with alcohol")).ok, false, "a different noun");
  assert.equal(guard(n("How do I reset my password?"), n("how can I reset my password")).ok, true, "function words only");
  assert.equal(guard(n("How do I reset my password?"), n("Quick question: how do I reset my pasword?")).ok, true, "filler and a typo");
});

test("cache: exact hit, TTL expiry, and per-scope isolation", () => {
  const c = new ResponseCache(100);
  const v = { text: "Answer", model: "m", inputTokens: 10, outputTokens: 5, costUsd: 0.001 };
  c.store("tenantA", "k1", "How do I reset my password?", v, 0, 1000);
  assert.equal(c.lookup("tenantA", "k1", "How do I reset my password?", 500, null).kind, "exact");
  assert.equal(c.lookup("tenantB", "k1", "How do I reset my password?", 500, { threshold: 0.6 }).kind, "miss", "another tenant never sees it");
  assert.equal(c.lookup("tenantA", "k1", "How do I reset my password?", 1000, null).kind, "miss", "expired at the TTL");
  assert.equal(c.size, 0);
});

test("cache: near hits pass the guard, near misses report why", () => {
  const c = new ResponseCache(100);
  const v = { text: "Answer", model: "m", inputTokens: 10, outputTokens: 5, costUsd: 0.001 };
  c.store("s", "k1", "How do I reset my password?", v, 0, 60_000);
  c.store("s", "k2", "Please refund order 12345 to my card, it was charged twice last week", v, 0, 60_000);
  const near = c.lookup("s", "x", "how do i reset my pasword", 10, { threshold: 0.6 });
  assert.equal(near.kind, "near");
  assert.ok(near.similarity! >= 0.6);
  const miss = c.lookup("s", "y", "Please refund order 12346 to my card, it was charged twice last week", 10, { threshold: 0.6 });
  assert.equal(miss.kind, "miss");
  assert.equal(miss.rejected?.reason, "different numbers");
  const noGuard = c.lookup("s", "y", "Please refund order 12346 to my card, it was charged twice last week", 10, { threshold: 0.6, guard: false });
  assert.equal(noGuard.kind, "near", "the guard is what stops that false hit");
});

test("cache: least recently used entries are evicted at capacity", () => {
  const c = new ResponseCache(2);
  const v = { text: "a", model: "m", inputTokens: 1, outputTokens: 1, costUsd: 0 };
  c.store("s", "1", null, v, 0, 1e9);
  c.store("s", "2", null, v, 0, 1e9);
  c.lookup("s", "1", null, 1, null); // touch 1
  c.store("s", "3", null, v, 2, 1e9);
  assert.equal(c.lookup("s", "2", null, 3, null).kind, "miss");
  assert.equal(c.lookup("s", "1", null, 3, null).kind, "exact");
  assert.equal(c.lookup("s", "3", null, 3, null).kind, "exact");
});
