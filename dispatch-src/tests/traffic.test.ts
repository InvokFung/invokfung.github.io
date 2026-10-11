import { test } from "node:test";
import assert from "node:assert/strict";
import { Traffic } from "../src/core/traffic";
import { Rng } from "../src/core/rng";

test("traffic: flat traffic is plain addition", () => {
  const t = Traffic.flat();
  assert.equal(t.arrive(12.5, 600), 612.5);
  assert.equal(t.latestDepart(12.5, 612.5), 600);
});

test("traffic: a trip that runs into rush hour slows down part-way (hand-worked)", () => {
  // free flow until 08:00, then 1.5x
  const t = new Traffic([
    [0, 1],
    [480, 1.5],
  ]);
  // leave 07:50 with 20 free-flow minutes: 10 at full speed, the other 10 take 15
  assert.ok(Math.abs(t.arrive(20, 470) - 495) < 1e-9);
  assert.ok(Math.abs(t.latestDepart(20, 495) - 470) < 1e-9);
});

test("traffic: arrive is FIFO and latestDepart is its inverse, with events on top of the profile", () => {
  const t = Traffic.day([
    { at: 913, factor: 1.7 },
    { at: 1001.5, factor: 1 },
  ]);
  const rng = new Rng("traffic");
  for (let i = 0; i < 5000; i++) {
    const f = rng.uniform(0, 60);
    const t0 = rng.uniform(300, 1300);
    const dt = rng.uniform(0, 30);
    const a = t.arrive(f, t0);
    assert.ok(a >= t0 + f * t.cMin - 1e-9 && a <= t0 + f * t.cMax + 1e-9);
    assert.ok(t.arrive(f, t0 + dt) >= a - 1e-9, "leaving later never arrives earlier");
    assert.ok(Math.abs(t.latestDepart(f, a) - t0) < 1e-7);
    if (i >= 300) continue;
    // brute force: integrate the factor in small steps
    let left = f;
    let clock = t0;
    const h = 0.01;
    while (left > 1e-12) {
      const step = Math.min(h, left * t.factor(clock));
      left -= step / t.factor(clock);
      clock += step;
    }
    assert.ok(Math.abs(clock - a) < 0.05, `${f} from ${t0}: ${a} vs ${clock}`);
  }
});
