import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseNote, median, movingAverage, noteScore, rate, robustSpread } from "../src/dsp/scoring";
import type { SegmentFrame } from "../src/dsp/segmenter";

const RATE = 93.75;
const note = (fn: (t: number) => number, seconds = 1): SegmentFrame[] =>
  Array.from({ length: Math.round(seconds * RATE) }, (_, i) => ({ t: i / RATE, midi: fn(i / RATE), db: -20 }));

test("median, robust spread and moving average", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.ok(Math.abs(robustSpread([1, 1, 1, 1, 50]) - 0) < 1e-12, "outlier ignored");
  assert.deepEqual(Array.from(movingAverage([0, 3, 0, 3, 0], 3)), [1.5, 1, 2, 1, 1.5]);
});

test("steady note 7 cents sharp", () => {
  const a = analyseNote(note(() => 69.07), 69);
  assert.ok(Math.abs(a.cents - 7) < 1e-9);
  assert.ok(a.drift < 0.01);
  assert.equal(a.vibrato, null);
  assert.equal(rate(a.cents), "close");
});

test("vibrato is measured, then removed before judging drift", () => {
  const a = analyseNote(note((t) => 69 - 0.04 + 0.18 * Math.sin(2 * Math.PI * 5.8 * t), 1.2), 69);
  assert.ok(Math.abs(a.cents + 4) < 1.5, `centre ${a.cents}`);
  assert.ok(a.vibrato && Math.abs(a.vibrato.rate - 5.8) < 0.25, `rate ${a.vibrato?.rate}`);
  assert.ok(a.vibrato && Math.abs(a.vibrato.depth - 18) < 3, `depth ${a.vibrato?.depth}`);
  assert.ok(a.drift < 2.5, `drift ${a.drift}`);
});

test("a wandering note has more drift than a steady one with vibrato", () => {
  const wander = analyseNote(note((t) => 69 + 0.25 * t - 0.12), 69);
  const vib = analyseNote(note((t) => 69 + 0.18 * Math.sin(2 * Math.PI * 5.5 * t)), 69);
  assert.ok(wander.drift > 3 * vib.drift, `${wander.drift} vs ${vib.drift}`);
});

test("the attack is trimmed: a slide into the note does not bias it", () => {
  const a = analyseNote(note((t) => (t < 0.05 ? 68.5 + t * 10 : 69.02)), 69);
  assert.ok(Math.abs(a.cents - 2) < 0.5);
});

test("scores fall with error and with drift", () => {
  assert.equal(noteScore({ cents: 2, drift: 1 }), 100);
  assert.ok(noteScore({ cents: 10, drift: 1 }) < noteScore({ cents: 4, drift: 1 }));
  assert.ok(noteScore({ cents: 4, drift: 15 }) < noteScore({ cents: 4, drift: 2 }));
  assert.equal(noteScore({ cents: -45, drift: 30 }), 0);
  assert.deepEqual([rate(0), rate(-12), rate(30), rate(-30)], ["in-tune", "close", "sharp", "flat"]);
});
