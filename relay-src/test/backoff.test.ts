import { test } from "node:test";
import assert from "node:assert/strict";
import { backoffCeiling, fullJitter, retryDelay, seeded } from "@relay/core";

test("backoff ceiling doubles from the base and stops at the cap", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6].map((n) => backoffCeiling(n, 100, 2000)),
    [100, 200, 400, 800, 1600, 2000, 2000],
  );
});

test("full jitter: every sample lies in [0, ceiling] and the distribution is uniform", () => {
  const rng = seeded(7);
  const N = 20_000;
  for (let n = 0; n < 8; n++) {
    const ceil = backoffCeiling(n, 100, 5000);
    const xs = Array.from({ length: N }, () => fullJitter(rng, n, 100, 5000));
    assert.ok(
      xs.every((x) => x >= 0 && x <= ceil),
      `retry ${n} out of bounds`,
    );
    // Kolmogorov–Smirnov distance to Uniform(0, ceil); the 99.9% critical value for N = 20k is ≈ 0.0138.
    const sorted = xs.sort((a, b) => a - b);
    let d = 0;
    for (let i = 0; i < N; i++) {
      const f = sorted[i] / ceil;
      d = Math.max(d, Math.abs(f - i / N), Math.abs(f - (i + 1) / N));
    }
    assert.ok(d < 0.0138, `retry ${n}: KS distance ${d.toFixed(4)}`);
    const mean = xs.reduce((a, b) => a + b, 0) / N;
    assert.ok(Math.abs(mean / ceil - 0.5) < 0.01, `retry ${n}: mean ${mean / ceil}`);
  }
});

test("full jitter spreads synchronized clients: no 10 ms slot holds more than 3% of 1000 retries", () => {
  const rng = seeded(3);
  const slots = new Map<number, number>();
  for (let i = 0; i < 1000; i++) {
    const s = Math.floor(fullJitter(rng, 3, 100, 5000) / 10);
    slots.set(s, (slots.get(s) ?? 0) + 1);
  }
  assert.ok(Math.max(...slots.values()) <= 30);
});

test("retry-after is a floor, never shortened by jitter", () => {
  const rng = seeded(1);
  for (let i = 0; i < 1000; i++) {
    const d = retryDelay(rng, 2, 100, 2000, 1500);
    assert.ok(d >= 1500 && d <= 1500 + 400);
  }
  for (let i = 0; i < 1000; i++) assert.ok(retryDelay(rng, 0, 100, 2000) <= 100);
});
