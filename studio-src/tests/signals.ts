import { gaussian, mulberry32 } from "../src/dsp/rng";

/** Test signals. Every generator is deterministic for a given seed. */

export function sine(freq: number, sr: number, n: number, phase = 0, amp = 0.5): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr + phase);
  return x;
}

/** Sum of harmonics with the given amplitudes (index 0 = fundamental), below Nyquist only. */
export function harmonics(freq: number, amps: number[], sr: number, n: number, seed = 1): Float32Array {
  const rand = mulberry32(seed);
  const phases = amps.map(() => rand() * 2 * Math.PI);
  const x = new Float32Array(n);
  amps.forEach((a, h) => {
    const f = freq * (h + 1);
    if (!a || f >= sr / 2) return;
    for (let i = 0; i < n; i++) x[i] += a * Math.sin((2 * Math.PI * f * i) / sr + phases[h]);
  });
  return normalise(x, 0.5);
}

/** Sawtooth-like spectrum: 1/h amplitudes. */
export const sawAmps = (count = 24) => Array.from({ length: count }, (_, h) => 1 / (h + 1));

/**
 * A harmonic tone with sinusoidal vibrato. Returns the signal and the
 * instantaneous fundamental, so a frame can be checked against the pitch at its centre.
 */
export function vibratoTone(freq: number, sr: number, n: number, rate = 5.5, depthCents = 20, amps = sawAmps(12)) {
  const x = new Float32Array(n);
  const f0 = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = freq * 2 ** ((depthCents * Math.sin((2 * Math.PI * rate * i) / sr)) / 1200);
    f0[i] = f;
    phase += (2 * Math.PI * f) / sr;
    let v = 0;
    for (let h = 0; h < amps.length; h++) if (f * (h + 1) < sr / 2) v += amps[h] * Math.sin((h + 1) * phase);
    x[i] = v;
  }
  return { x: normalise(x, 0.5), f0 };
}

/** Adds white Gaussian noise at the given signal-to-noise ratio (dB). */
export function withNoise(x: Float32Array, snrDb: number, seed = 3): Float32Array {
  const rand = mulberry32(seed);
  let p = 0;
  for (const v of x) p += v * v;
  p /= x.length;
  const sigma = Math.sqrt(p / 10 ** (snrDb / 10));
  return x.map((v) => v + sigma * gaussian(rand));
}

export function normalise(x: Float32Array, peak: number): Float32Array {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  return x;
}

export function whiteNoise(n: number, amp = 0.3, seed = 5): Float32Array {
  const rand = mulberry32(seed);
  return Float32Array.from({ length: n }, () => amp * gaussian(rand));
}
