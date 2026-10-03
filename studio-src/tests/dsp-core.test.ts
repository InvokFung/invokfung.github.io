import { test } from "node:test";
import assert from "node:assert/strict";
import { FFT } from "../src/dsp/fft";
import { Autocorrelator, autocorrNaive } from "../src/dsp/autocorr";
import { mulberry32 } from "../src/dsp/rng";
import { OneEuroFilter, PitchSmoother } from "../src/dsp/smoothing";
import { cents, freqToMidi, midiToFreq, nearestNote, noteLabel } from "../src/dsp/notes";

test("FFT matches a direct DFT and inverts exactly", () => {
  const n = 64;
  const rand = mulberry32(11);
  const re = Float64Array.from({ length: n }, () => rand() - 0.5);
  const im = Float64Array.from({ length: n }, () => rand() - 0.5);
  const [r0, i0] = [re.slice(), im.slice()];
  new FFT(n).transform(re, im);
  for (const k of [0, 1, 7, 31, 63]) {
    let sr = 0;
    let si = 0;
    for (let j = 0; j < n; j++) {
      const a = (-2 * Math.PI * j * k) / n;
      sr += r0[j] * Math.cos(a) - i0[j] * Math.sin(a);
      si += r0[j] * Math.sin(a) + i0[j] * Math.cos(a);
    }
    assert.ok(Math.abs(sr - re[k]) < 1e-9 && Math.abs(si - im[k]) < 1e-9, `bin ${k}`);
  }
  new FFT(n).transform(re, im, true);
  for (let j = 0; j < n; j++) assert.ok(Math.abs(re[j] - r0[j]) < 1e-12 && Math.abs(im[j] - i0[j]) < 1e-12);
});

test("FFT rejects sizes that are not powers of two", () => {
  assert.throws(() => new FFT(1000));
});

test("real-input FFT autocorrelation equals the direct sum, for even and odd window sizes", () => {
  for (const W of [16, 333, 1024]) {
    const rand = mulberry32(W);
    const x = Float32Array.from({ length: W }, (_, i) => Math.sin(i * 0.21) + rand() - 0.5);
    const L = W - 1;
    const r = new Float64Array(L + 1);
    const m = new Float64Array(L + 1);
    new Autocorrelator(W).compute(x, r, m, L);
    const ref = autocorrNaive(x, L);
    for (let t = 0; t <= L; t++) assert.ok(Math.abs(r[t] - ref[t]) <= 1e-9 * ref[0], `W=${W} lag ${t}`);
    // m′ against its definition at a few lags (on the mean-removed signal).
    const mean = x.reduce((a, b) => a + b, 0) / W;
    for (const t of [0, 1, W >> 1, L]) {
      let s = 0;
      for (let j = 0; j < W - t; j++) s += (x[j] - mean) ** 2 + (x[j + t] - mean) ** 2;
      assert.ok(Math.abs(m[t] - s) <= 1e-9 * m[0], `m′ W=${W} lag ${t}`);
    }
  }
});

test("note maths: A4 reference, cents, nearest note", () => {
  assert.equal(midiToFreq(69), 440);
  assert.ok(Math.abs(midiToFreq(60) - 261.6256) < 1e-3);
  assert.ok(Math.abs(freqToMidi(415, 415) - 69) < 1e-12);
  assert.ok(Math.abs(cents(441, 440) - 3.93) < 0.01);
  const n = nearestNote(452, 440);
  assert.equal(n.midi, 69);
  assert.ok(Math.abs(n.cents - 46.6) < 0.1);
  assert.equal(noteLabel(61), "C♯4");
  assert.equal(noteLabel(61, true), "D♭4");
  assert.equal(noteLabel(21), "A0");
});

test("One Euro filter: steady input gets quieter, a ramp is followed closely", () => {
  const rand = mulberry32(2);
  const f = new OneEuroFilter(1.2, 0.04);
  let rawVar = 0;
  let outVar = 0;
  for (let i = 0; i < 400; i++) {
    const v = (rand() - 0.5) * 2;
    const y = f.filter(v, i / 90);
    if (i > 50) {
      rawVar += v * v;
      outVar += y * y;
    }
  }
  assert.ok(outVar < rawVar / 4, "jitter reduced");
  const g = new OneEuroFilter(1.2, 0.5);
  let y = 0;
  for (let i = 0; i <= 90; i++) y = g.filter(i / 9, i / 90); // 10 units per second
  assert.ok(Math.abs(y - 10) < 0.6, `ramp lag ${(10 - y).toFixed(2)}`);
});

test("pitch smoother snaps to a new note instead of gliding", () => {
  const s = new PitchSmoother();
  for (let i = 0; i < 30; i++) s.push(69, i / 90);
  assert.equal(s.push(72, 31 / 90), 72);
});
