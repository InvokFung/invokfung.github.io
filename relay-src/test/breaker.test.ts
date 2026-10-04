import { test } from "node:test";
import assert from "node:assert/strict";
import { CircuitBreaker, type BreakerConfig, type BreakerTransition } from "@relay/core";

const cfg: BreakerConfig = { window: 10, minRequests: 5, failureRate: 0.5, cooldownMs: 1000, maxCooldownMs: 4000, probes: 2 };

function make() {
  const log: BreakerTransition[] = [];
  return { b: new CircuitBreaker("up", cfg, (t) => log.push(t)), log };
}

test("breaker stays closed until the window holds minRequests, then opens on a confident failure rate", () => {
  const { b, log } = make();
  for (let i = 0; i < 4; i++) b.failure(i);
  assert.equal(b.state, "closed", "4 failures < minRequests");
  b.failure(4);
  assert.equal(b.state, "open", "5 of 5: the 95% lower bound is 57%, above 50%");
  assert.deepEqual(
    log.map((t) => [t.from, t.to]),
    [["closed", "open"]],
  );
  assert.match(log[0].reason, /100% of last 5 failed \(95% lower bound 57%\)/);
});

test("breaker: noise at a steady error rate does not trip it, a real outage does", () => {
  const { b } = make();
  // 5 of the last 10 failed: a raw 50% share would trip, but the lower bound is 24%.
  for (let i = 0; i < 5; i++) b.success(i), b.failure(i);
  assert.equal(b.state, "closed");
  // A steady 30% error rate for a thousand calls never trips it.
  for (let i = 0; i < 1000; i++) (i % 10 < 3 ? b.failure(i) : b.success(i));
  assert.equal(b.state, "closed");
  assert.equal(b.trips, 0);
  // Then the upstream goes hard down.
  let n = 0;
  while (b.state === "closed") b.failure(2000 + n++);
  assert.equal(n, 9, "9 of the 10-call window: lower bound 60%");
});

test("breaker: a rolling window, so old failures age out", () => {
  const { b } = make();
  for (let i = 0; i < 4; i++) b.failure(i);
  for (let i = 0; i < 10; i++) b.success(10 + i);
  // The four early failures have left the 10-call window.
  for (let i = 0; i < 4; i++) b.failure(30 + i);
  assert.equal(b.state, "closed", "4 of the last 10");
  for (let i = 0; i < 4; i++) b.failure(40 + i);
  assert.equal(b.state, "closed", "8 of the last 10: lower bound 49%");
  b.failure(50);
  assert.equal(b.state, "open", "9 of the last 10: lower bound 60%");
});

test("breaker: open refuses until the cooldown, then admits exactly one probe", () => {
  const { b, log } = make();
  for (let i = 0; i < 5; i++) b.failure(0);
  assert.equal(b.allow(999), false);
  assert.equal(b.retryAt(), 1000);
  assert.equal(b.allow(1000), true, "cooldown over");
  assert.equal(b.state, "half-open");
  assert.equal(b.acquire(1000), true, "the probe");
  assert.equal(b.acquire(1001), false, "second caller is refused while the probe is out");
  assert.equal(b.allow(1001), false);
  b.success(1100);
  assert.equal(b.state, "half-open", "one success of two");
  assert.equal(b.acquire(1100), true);
  b.success(1200);
  assert.equal(b.state, "closed");
  assert.deepEqual(
    log.map((t) => t.to),
    ["open", "half-open", "closed"],
  );
});

test("breaker: a failed probe re-opens with a doubled cooldown, capped", () => {
  const { b } = make();
  for (let i = 0; i < 5; i++) b.failure(0);
  let t = 0;
  const cooldowns: number[] = [];
  for (let round = 0; round < 4; round++) {
    const reopenAt = b.retryAt();
    cooldowns.push(reopenAt - t);
    t = reopenAt;
    assert.equal(b.acquire(t), true);
    b.failure(t);
    assert.equal(b.state, "open");
  }
  assert.deepEqual(cooldowns, [1000, 2000, 4000, 4000]);
  // Recovery resets the cooldown.
  t = b.retryAt();
  b.acquire(t);
  b.success(t);
  b.acquire(t);
  b.success(t);
  assert.equal(b.state, "closed");
  for (let i = 0; i < 5; i++) b.failure(t);
  assert.equal(b.retryAt() - t, 1000);
});

test("breaker: release frees the probe slot without a verdict", () => {
  const { b } = make();
  for (let i = 0; i < 5; i++) b.failure(0);
  assert.equal(b.acquire(1000), true);
  b.release();
  assert.equal(b.state, "half-open");
  assert.equal(b.acquire(1000), true, "slot free again");
});

test("breaker: successes while closed keep it closed", () => {
  const { b } = make();
  for (let i = 0; i < 100; i++) (i % 3 === 0 ? b.failure(i) : b.success(i));
  assert.equal(b.state, "closed", "33% failures");
});
