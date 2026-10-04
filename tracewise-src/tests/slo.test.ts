import assert from "node:assert/strict";
import { test } from "node:test";
import { PAGE_RULES, SloTracker, budgetSpent, burnRate } from "../src/core/slo";

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("burn rate is the error ratio over the error budget", () => {
  assert.ok(close(burnRate(144, 10_000, 0.999), 14.4));
  assert.ok(close(burnRate(5, 1000, 0.995), 1));
  assert.equal(burnRate(0, 0, 0.99), 0);
});

test("the workbook thresholds spend 2% of a 30-day budget in 1h and 5% in 6h", () => {
  assert.ok(close(budgetSpent(14.4, 60), 0.02));
  assert.ok(close(budgetSpent(6, 360), 0.05));
});

test("a fast burn pages only when both the 1h and the 5m windows burn above 14.4x", () => {
  const slo = new SloTracker(0.995, PAGE_RULES);
  for (let m = 0; m < 60; m++) slo.push(1000, 1000);
  assert.equal(slo.evaluate()[0].firing, false);
  // 50% bad: the 5m window crosses at once; the 1h window needs 7.2% bad overall.
  let firedAt = -1;
  for (let m = 0; m < 20; m++) {
    slo.push(500, 1000);
    if (firedAt < 0 && slo.evaluate()[0].firing) firedAt = m;
  }
  // 60 minutes at 50% burn 100x; the hour holds k bad minutes: 0.5k/60 > 0.072 once k >= 9.
  assert.equal(firedAt, 8);
});

test("a short spike alone does not page, and the alert resets as soon as the burn stops", () => {
  const slo = new SloTracker(0.995, PAGE_RULES);
  for (let m = 0; m < 60; m++) slo.push(1000, 1000);
  slo.push(0, 1000); // one terrible minute: 5m window burns 40x, 1h window 3.3x
  assert.equal(slo.evaluate()[0].firing, false);
  for (let m = 0; m < 15; m++) slo.push(400, 1000);
  assert.equal(slo.evaluate()[0].firing, true);
  for (let m = 0; m < 5; m++) slo.push(1000, 1000);
  const fast = slo.evaluate()[0];
  assert.ok(fast.long > 14.4, "the hour still looks bad");
  assert.equal(fast.firing, false, "but the short window has recovered");
});

test("windows cover at most the minutes recorded", () => {
  const slo = new SloTracker(0.99, PAGE_RULES);
  slo.push(90, 100);
  assert.ok(close(slo.ratio(60), 0.1));
  assert.ok(close(slo.burn(360), 10));
});
