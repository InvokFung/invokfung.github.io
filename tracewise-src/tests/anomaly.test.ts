import assert from "node:assert/strict";
import { test } from "node:test";
import { Cusum, Ewma, RateDetector, SeriesDetector, alphaForHalfLife, binomialZ, mad, median, robustZ } from "../src/core/anomaly";
import { ERROR_DETECTOR, LATENCY_DETECTOR } from "../src/core/pipeline";
import { Rng } from "../src/core/rng";

test("EWMA follows its recurrence", () => {
  const e = new Ewma(0.5);
  assert.equal(e.update(10), 10);
  assert.equal(e.update(20), 15);
  assert.equal(e.update(20), 17.5);
  assert.throws(() => new Ewma(0));
});

test("a half-life of h samples halves an old value's weight after h updates", () => {
  const a = alphaForHalfLife(10);
  assert.ok(Math.abs(Math.pow(1 - a, 10) - 0.5) < 1e-12);
  const e = new Ewma(a);
  e.update(0);
  for (let i = 0; i < 10; i++) e.update(1);
  assert.ok(Math.abs(e.value - 0.5) < 1e-9);
});

test("median and MAD", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(mad([1, 1, 2, 2, 4, 6, 9]), 1);
});

test("the robust z-score ignores an outlier in the reference sample", () => {
  const sample = [10, 11, 9, 10, 12, 8, 10, 11, 9, 1000];
  const z = robustZ(14, sample);
  assert.ok(z > 2 && z < 4, `z=${z}`);
  // A plain z-score would be dragged down to nothing by the outlier.
  const m = sample.reduce((a, b) => a + b) / sample.length;
  const sd = Math.sqrt(sample.reduce((a, b) => a + (b - m) ** 2, 0) / sample.length);
  assert.ok(Math.abs((14 - m) / sd) < 0.5);
});

test("CUSUM catches a 1.5-sigma shift that no single point would flag, and estimates its onset", () => {
  const rng = new Rng(5);
  let delays = 0;
  let onsetErr = 0;
  for (let run = 0; run < 50; run++) {
    const c = new Cusum({ k: 0.5, h: 5 });
    let fired = -1;
    for (let i = 0; i < 200 && fired < 0; i++) {
      const z = rng.normal() + (i >= 100 ? 1.5 : 0);
      const r = c.update(z, i);
      if (r.alarm && i >= 100) {
        fired = i;
        onsetErr += Math.abs(r.onset - 100);
      } else if (r.alarm) c.reset();
    }
    assert.ok(fired >= 100, "missed the shift");
    delays += fired - 100;
  }
  assert.ok(delays / 50 < 8, `mean delay ${delays / 50}`);
  assert.ok(onsetErr / 50 < 4, `mean onset error ${onsetErr / 50}`);
});

test("the alerting CUSUM rarely fires on pure noise", () => {
  const rng = new Rng(6);
  let alarms = 0;
  const steps = 20_000;
  const c = new Cusum(LATENCY_DETECTOR.cusum);
  for (let i = 0; i < steps; i++)
    if (c.update(rng.normal(), i).alarm) {
      alarms++;
      c.reset();
    }
  // Fewer than one alarm per 2,000 minutes of Gaussian noise.
  assert.ok(alarms / steps < 1 / 2000, `${alarms} alarms`);
});

test("the series detector alarms on a level shift and does not learn the faulty level", () => {
  const rng = new Rng(7);
  const d = new SeriesDetector(LATENCY_DETECTOR);
  for (let i = 0; i < 60; i++) d.update(Math.log(20) + 0.08 * rng.normal());
  const before = d.update(Math.log(20));
  let alarmAt = -1;
  for (let i = 0; i < 10; i++) {
    const s = d.update(Math.log(40) + 0.08 * rng.normal());
    if (s.alarm && alarmAt < 0) alarmAt = i;
  }
  assert.ok(alarmAt >= 0 && alarmAt <= 2, `alarm after ${alarmAt}`);
  assert.ok(Math.abs(d.last.forecast - before.forecast) < 0.1, "baseline drifted towards the fault");
});

test("binomial z accounts for sample size", () => {
  assert.equal(binomialZ(0, 0, 0.01), 0);
  assert.ok(binomialZ(3, 100, 0.01) < binomialZ(30, 1000, 0.01));
  assert.ok(Math.abs(binomialZ(10, 1000, 0.01)) < 1e-12);
});

test("the error-rate detector alarms when errors jump from 0.2% to 5%", () => {
  const rng = new Rng(8);
  const d = new RateDetector(ERROR_DETECTOR);
  const minute = (p: number) => {
    let e = 0;
    for (let i = 0; i < 400; i++) if (rng.chance(p)) e++;
    return d.update(e, 400);
  };
  for (let i = 0; i < 60; i++) assert.equal(minute(0.002).alarm, false);
  let fired = false;
  for (let i = 0; i < 3; i++) fired ||= minute(0.05).alarm;
  assert.ok(fired);
});
