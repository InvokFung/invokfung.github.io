import { test } from "node:test";
import assert from "node:assert/strict";
import { CASES, noiseFalsePositives, runSweep, timePerFrame, vibratoAccuracy, type SweepResult } from "./accuracy";
import { McLeodDetector, YinDetector, PROFILES, detectorConfig, interpolatePeak } from "../src/dsp/pitch";
import { sine } from "./signals";

/** Bounds per case: [max |error| in cents for the clean cases or p95 for noisy ones, allowed gross errors, allowed misses]. */
const BOUNDS: Record<string, { max?: number; p95?: number; gross: number; missed: number }> = {
  "sine-violin": { max: 0.05, gross: 0, missed: 0 },
  "sine-piano": { max: 0.05, gross: 0, missed: 0 },
  "saw-violin": { max: 0.5, gross: 0, missed: 0 },
  "saw-piano": { max: 0.5, gross: 0, missed: 0 },
  "weak-fundamental": { max: 0.5, gross: 0, missed: 0 },
  "missing-fundamental": { max: 0.5, gross: 0, missed: 0 },
  "odd-harmonics": { max: 0.5, gross: 0, missed: 0 },
  "piano-bass": { max: 0.5, gross: 0, missed: 0 },
  snr20: { max: 1.5, gross: 0, missed: 0 },
  snr10: { p95: 2, max: 5, gross: 0, missed: 0 },
  snr5: { p95: 6, gross: 2, missed: 2 },
};

const describe = (r: SweepResult) =>
  `${r.label}: n=${r.n} missed=${r.missed} gross=${r.gross} median=${r.median.toFixed(3)}¢ p95=${r.p95.toFixed(3)}¢ max=${r.max.toFixed(3)}¢`;

for (const c of CASES) {
  const b = BOUNDS[c.id];
  if (!b) continue;
  test(`MPM · ${c.label}`, () => {
    const r = runSweep(c, "mpm");
    assert.ok(r.missed <= b.missed, describe(r));
    assert.ok(r.gross <= b.gross, `octave/gross errors · ${describe(r)}`);
    if (b.max !== undefined) assert.ok(r.max <= b.max, describe(r));
    if (b.p95 !== undefined) assert.ok(r.p95 <= b.p95, describe(r));
  });
}

test("MPM makes no octave errors where YIN does (5 dB SNR)", () => {
  const c = CASES.find((x) => x.id === "snr5")!;
  const mpm = runSweep(c, "mpm");
  const yin = runSweep(c, "yin");
  assert.ok(mpm.gross + mpm.missed < yin.gross + yin.missed, `${describe(mpm)} vs YIN ${describe(yin)}`);
});

test("YIN (parabolic interpolation, no refinement) is within 3 cents on clean tones", () => {
  const r = runSweep(CASES.find((x) => x.id === "sine-violin")!, "yin");
  assert.equal(r.gross + r.missed, 0);
  assert.ok(r.max < 3, describe(r));
});

test("vibrato: each frame matches the instantaneous pitch at its centre", () => {
  const v = vibratoAccuracy();
  assert.ok(v.p95 < 1, `median ${v.median.toFixed(3)}¢ p95 ${v.p95.toFixed(3)}¢ max ${v.max.toFixed(3)}¢`);
});

test("white noise and silence are not called pitched", () => {
  const n = noiseFalsePositives();
  assert.ok(n.pitched / n.frames <= 0.01, `${n.pitched}/${n.frames}`);
  const det = new McLeodDetector(detectorConfig(PROFILES.violin, 48000));
  assert.equal(det.detect(new Float32Array(det.config.size)).freq, 0);
  assert.equal(new YinDetector(det.config).detect(new Float32Array(det.config.size)).freq, 0);
});

test("loudness does not change the estimate (NSDF is level-independent)", () => {
  const det = new McLeodDetector(detectorConfig(PROFILES.violin, 48000));
  const quiet = det.detect(sine(440, 48000, det.config.size, 0.4, 0.001)).freq;
  const loud = det.detect(sine(440, 48000, det.config.size, 0.4, 0.9)).freq;
  assert.ok(Math.abs(quiet - loud) < 1e-6);
});

test("cosine interpolation is exact on a sampled cosine peak", () => {
  for (const delta of [-0.4, -0.1, 0, 0.27, 0.49]) {
    const w = 0.5;
    const y = (k: number) => Math.cos(w * (k - delta));
    const p = interpolatePeak(y(-1), y(0), y(1), "cosine");
    assert.ok(Math.abs(p.offset - delta) < 1e-12 && Math.abs(p.value - 1) < 1e-12);
  }
});

test("a frame costs well under a millisecond (budget: one hop ≈ 10.7 ms)", () => {
  for (const p of ["violin", "piano"] as const) {
    const t = timePerFrame("mpm", p, 48000, 5, 100);
    assert.ok(t.us < 1000, `${p}: ${t.us.toFixed(0)} µs per ${t.window}-sample frame`);
  }
});
