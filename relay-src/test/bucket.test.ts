import { test } from "node:test";
import assert from "node:assert/strict";
import { RatioBudget, seeded, TokenBucket } from "@relay/core";

test("token bucket: starts full, refuses the overflow and says exactly when it will fit", () => {
  const b = new TokenBucket(10, 60_000, 0); // 10 per minute
  for (let i = 0; i < 10; i++) assert.equal(b.take(1, 0).ok, true);
  const r = b.take(1, 0);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.retryAfterMs, 6000);
  assert.equal(b.take(1, 5999).ok, false);
  assert.equal(b.take(1, 6000).ok, true);
});

test("token bucket: refill is linear and capped at capacity", () => {
  const b = new TokenBucket(100, 1000, 0);
  assert.equal(b.take(100, 0).ok, true);
  assert.equal(Math.round(b.available(250)), 25);
  assert.equal(Math.round(b.available(500)), 50);
  assert.equal(b.available(10_000), 100);
});

test("token bucket: a request larger than the bucket can never fit", () => {
  const b = new TokenBucket(5, 1000, 0);
  const r = b.take(6, 0);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.retryAfterMs, Infinity);
  assert.equal(b.available(0), 5, "a refused take takes nothing");
});

test("token bucket: settling over the estimate creates debt that later requests wait out", () => {
  const b = new TokenBucket(1000, 60_000, 0);
  assert.equal(b.take(600, 0).ok, true); // estimate
  b.settle(900, 0); // actually used 1500: 900 more than reserved
  assert.ok(b.available(0) < 0, "in debt");
  const r = b.take(100, 0);
  assert.equal(r.ok, false);
  // 500 tokens of debt + 100 wanted = 600 tokens at 1000/min = 36 s
  assert.equal(!r.ok && r.retryAfterMs, 36_000);
  b.settle(-5000, 0);
  assert.equal(b.available(0), 1000, "refunds never exceed capacity");
});

test("token bucket: over any interval, admitted ≤ capacity + rate × elapsed (random workload)", () => {
  const rng = seeded(42);
  for (let trial = 0; trial < 50; trial++) {
    const cap = 5 + Math.floor(rng.next() * 50);
    const period = 1000 + Math.floor(rng.next() * 60_000);
    const b = new TokenBucket(cap, period, 0);
    let t = 0;
    let admitted = 0;
    for (let i = 0; i < 2000; i++) {
      t += rng.next() * (period / cap) * 0.5;
      const n = 1 + Math.floor(rng.next() * 3);
      if (b.take(n, t).ok) admitted += n;
    }
    assert.ok(admitted <= cap + (cap / period) * t + 1e-6, `trial ${trial}: ${admitted} > ${cap + (cap / period) * t}`);
    assert.ok(admitted >= (cap / period) * t * 0.9, `trial ${trial}: bucket under-admitted (${admitted})`);
  }
});

test("ratio budget: extra work stays under ratio × requests + burst", () => {
  const r = new RatioBudget(0.1, 5);
  let spent = 0;
  for (let i = 0; i < 1000; i++) {
    r.deposit();
    if (r.trySpend()) spent++;
  }
  assert.ok(spent <= 0.1 * 1000 + 5, `${spent}`);
  assert.ok(spent >= 0.1 * 1000 - 1, `${spent}`);
});
