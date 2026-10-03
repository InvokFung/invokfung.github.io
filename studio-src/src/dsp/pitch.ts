import { Autocorrelator } from "./autocorr";

export interface PitchEstimate {
  /** Fundamental frequency in Hz, or 0 when the frame has no clear pitch. */
  freq: number;
  /** Periodicity 0..1: the NSDF peak height (MPM) or 1 − d′ (YIN). */
  clarity: number;
}

export interface DetectorConfig {
  sampleRate: number;
  /** Analysis window W in samples. Must hold at least two periods of minFreq. */
  size: number;
  minFreq: number;
  maxFreq: number;
}

export interface PitchDetector {
  readonly config: DetectorConfig;
  detect(frame: ArrayLike<number>): PitchEstimate;
}

export type Interpolation = "parabolic" | "cosine";

/**
 * Sub-sample peak position from three samples around a local maximum at offset 0.
 *
 * "cosine" fits y = A·cos(ω(k − δ)) through the three points, which is exact for
 * the NSDF of a sinusoid (n′(τ) ≈ cos(2πfτ/fs)): (y₋ + y₊)/(2y₀) = cos ω, and δ
 * follows from the odd part. It removes the bias a parabola has when a period is
 * only ~10 samples long (the top of the piano). It falls back to the parabola
 * when the three points don't look like a cosine peak.
 */
export function interpolatePeak(ym: number, y0: number, yp: number, how: Interpolation): { offset: number; value: number } {
  if (how === "cosine" && y0 > 0) {
    const c = (ym + yp) / (2 * y0);
    if (c > -1 && c < 1) {
      const w = Math.acos(c);
      const s = Math.sin(w);
      if (s > 1e-9) {
        const offset = Math.atan((yp - ym) / (2 * y0 * s)) / w;
        if (Math.abs(offset) <= 1) {
          const value = y0 / Math.cos(w * offset);
          return { offset, value };
        }
      }
    }
  }
  const den = ym - 2 * y0 + yp;
  if (den === 0) return { offset: 0, value: y0 };
  const offset = Math.max(-1, Math.min(1, (0.5 * (ym - yp)) / den));
  return { offset, value: y0 - 0.25 * (ym - yp) * offset };
}

function lagRange(cfg: DetectorConfig) {
  // The NSDF lobe around a period τ spans roughly τ ± τ/4, so search a little past
  // the longest period or the lowest notes lose their peak to the edge.
  const maxLag = Math.min(Math.ceil((1.3 * cfg.sampleRate) / cfg.minFreq) + 2, cfg.size - 2);
  const minLag = Math.max(2, Math.floor(cfg.sampleRate / cfg.maxFreq) - 1);
  if (maxLag <= minLag) throw new Error("Window too small for the requested frequency range");
  return { minLag, maxLag };
}

/** Frames quieter than this (RMS of the mean-removed signal) are treated as silence. */
const SILENCE_RMS = 1e-5;

/**
 * McLeod Pitch Method (McLeod & Wyvill, "A smarter way to find pitch", 2005).
 *
 *   n′(τ) = 2·r′(τ) / m′(τ)          normalised square difference, in [−1, 1]
 *
 * n′ is 1 at lags where the frame repeats exactly, independent of loudness and of
 * how much of the window overlaps. Peak picking: take the highest point of each
 * positive lobe of n′ ("key maxima"), then choose the FIRST key maximum whose height
 * is at least k × the highest one. Choosing the first strong peak, not the highest,
 * is what stops the detector from jumping down an octave (2τ also repeats).
 *
 * Refinement: a high note's period is only a few samples long, so the error of
 * interpolating one peak is a visible fraction of it. The frame also repeats at
 * k·τ, and interpolating the peak there and dividing by k shrinks that error by
 * about k (k ≈ 20 at the top of the violin). See `refine`.
 */
export class McLeodDetector implements PitchDetector {
  readonly config: DetectorConfig;
  /** Fraction of the highest key maximum a peak must reach to be chosen. */
  readonly cutoff: number;
  /** Below this NSDF height the frame is called unpitched. */
  readonly minPeak: number;
  readonly interpolation: Interpolation;
  /** The last frame's NSDF, kept for inspection and visualisation. */
  readonly nsdf: Float64Array;
  private readonly ac: Autocorrelator;
  private readonly r: Float64Array;
  private readonly m: Float64Array;
  private readonly minLag: number;
  private readonly maxLag: number;
  /** Lags beyond maxLag are only used to refine short periods; the overlap stays ≥ W/2. */
  private readonly extLag: number;
  private readonly peakLag: Float64Array;
  private readonly peakVal: Float64Array;

  constructor(config: DetectorConfig, opts: { cutoff?: number; minPeak?: number; interpolation?: Interpolation } = {}) {
    this.config = config;
    this.cutoff = opts.cutoff ?? 0.93;
    this.minPeak = opts.minPeak ?? 0.5;
    this.interpolation = opts.interpolation ?? "cosine";
    ({ minLag: this.minLag, maxLag: this.maxLag } = lagRange(config));
    this.extLag = Math.max(this.maxLag, Math.min(config.size >> 1, config.size - 2));
    this.ac = new Autocorrelator(config.size);
    this.r = new Float64Array(this.extLag + 1);
    this.m = new Float64Array(this.extLag + 1);
    this.nsdf = new Float64Array(this.extLag + 1);
    this.peakLag = new Float64Array(64);
    this.peakVal = new Float64Array(64);
  }

  detect(frame: ArrayLike<number>): PitchEstimate {
    const { r, m, nsdf, minLag, maxLag, extLag } = this;
    const energy = this.ac.compute(frame, r, m, extLag);
    if (Math.sqrt(energy / this.config.size) < SILENCE_RMS) return { freq: 0, clarity: 0 };
    for (let t = 0; t <= extLag; t++) nsdf[t] = m[t] > 0 ? (2 * r[t]) / m[t] : 0;

    // Walk the positive lobes, skipping the one that starts at τ = 0.
    let t = 1;
    while (t < maxLag && nsdf[t] > 0) t++;
    let count = 0;
    let highest = 0;
    while (t < maxLag && count < this.peakLag.length) {
      while (t < maxLag && nsdf[t] <= 0) t++;
      if (t >= maxLag) break;
      let best = t;
      while (t < maxLag && nsdf[t] > 0) {
        if (nsdf[t] > nsdf[best]) best = t;
        t++;
      }
      // A lobe cut off by maxLag counts only if its maximum is a real turning point.
      if (t >= maxLag && best >= maxLag - 1) break;
      if (best < minLag) continue;
      const p = interpolatePeak(nsdf[best - 1], nsdf[best], nsdf[best + 1], this.interpolation);
      this.peakLag[count] = best + p.offset;
      this.peakVal[count] = p.value;
      if (p.value > highest) highest = p.value;
      count++;
    }
    if (count === 0 || highest < this.minPeak) return { freq: 0, clarity: Math.max(0, highest) };

    const threshold = this.cutoff * highest;
    for (let i = 0; i < count; i++) {
      if (this.peakVal[i] >= threshold) {
        const period = this.refine(this.peakLag[i], this.peakVal[i]);
        return { freq: this.config.sampleRate / period, clarity: Math.min(1, this.peakVal[i]) };
      }
    }
    return { freq: 0, clarity: 0 };
  }

  /** Re-measures a period τ over k cycles: the strong peak nearest k·τ, divided by k, for the largest k available. */
  private refine(tau: number, height: number): number {
    const { nsdf, extLag } = this;
    for (let k = Math.floor((extLag - 1) / tau); k >= 2; k--) {
      const centre = Math.round(k * tau);
      let best = -1;
      for (let j = Math.max(1, centre - 2); j <= Math.min(extLag - 1, centre + 2); j++) {
        if (nsdf[j] >= nsdf[j - 1] && nsdf[j] >= nsdf[j + 1] && (best < 0 || nsdf[j] > nsdf[best])) best = j;
      }
      if (best < 0 || nsdf[best] < this.cutoff * height) continue;
      const p = interpolatePeak(nsdf[best - 1], nsdf[best], nsdf[best + 1], this.interpolation);
      return (best + p.offset) / k;
    }
    return tau;
  }
}

/**
 * YIN (de Cheveigné & Kawahara, 2002), computed from the same r′ and m′:
 *
 *   d(τ)  = Σ (x[j] − x[j+τ])² = m′(τ) − 2·r′(τ)
 *   d′(τ) = d(τ) · τ / Σ_{i=1..τ} d(i)            cumulative-mean normalisation
 *
 * Pick the first τ where d′ dips below the threshold, slide to the bottom of
 * that dip, and interpolate. Kept for comparison in the tests and benchmark;
 * the app uses MPM, which held up better on weak fundamentals.
 */
export class YinDetector implements PitchDetector {
  readonly config: DetectorConfig;
  readonly threshold: number;
  private readonly ac: Autocorrelator;
  private readonly r: Float64Array;
  private readonly m: Float64Array;
  private readonly d: Float64Array;
  private readonly minLag: number;
  private readonly maxLag: number;

  constructor(config: DetectorConfig, opts: { threshold?: number } = {}) {
    this.config = config;
    this.threshold = opts.threshold ?? 0.12;
    ({ minLag: this.minLag, maxLag: this.maxLag } = lagRange(config));
    this.ac = new Autocorrelator(config.size);
    this.r = new Float64Array(this.maxLag + 1);
    this.m = new Float64Array(this.maxLag + 1);
    this.d = new Float64Array(this.maxLag + 1);
  }

  detect(frame: ArrayLike<number>): PitchEstimate {
    const { r, m, d, minLag, maxLag } = this;
    const energy = this.ac.compute(frame, r, m, maxLag);
    if (Math.sqrt(energy / this.config.size) < SILENCE_RMS) return { freq: 0, clarity: 0 };
    d[0] = 1;
    let sum = 0;
    for (let t = 1; t <= maxLag; t++) {
      const diff = Math.max(0, m[t] - 2 * r[t]);
      sum += diff;
      d[t] = sum > 0 ? (diff * t) / sum : 1;
    }
    let tau = -1;
    for (let t = minLag; t < maxLag; t++) {
      if (d[t] < this.threshold) {
        while (t + 1 < maxLag && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      // No dip under the threshold: fall back to the global minimum if it is still fairly periodic.
      let best = minLag;
      for (let t = minLag + 1; t < maxLag; t++) if (d[t] < d[best]) best = t;
      if (d[best] > 0.35) return { freq: 0, clarity: Math.max(0, 1 - d[best]) };
      tau = best;
    }
    // Interpolate the minimum of d′ (negate to reuse the peak interpolator).
    const p = interpolatePeak(-d[tau - 1], -d[tau], -d[tau + 1], "parabolic");
    return { freq: this.config.sampleRate / (tau + p.offset), clarity: Math.max(0, Math.min(1, 1 + p.value)) };
  }
}

/** Instrument-specific detector settings: a shorter window reacts faster, a longer one reaches lower. */
export interface DetectorProfile {
  minFreq: number;
  maxFreq: number;
  /** Window length in seconds; rounded up to a power of two in samples. */
  window: number;
}

export const PROFILES = {
  // G3 = 196 Hz is the violin's lowest note; E7 and above is rare outside harmonics.
  violin: { minFreq: 170, maxFreq: 3600, window: 0.02 },
  // G1 (49 Hz) to C8 (4186 Hz). The piano's bottom octave needs a window too long to feel live.
  piano: { minFreq: 46, maxFreq: 4400, window: 0.04 },
} satisfies Record<string, DetectorProfile>;

export function detectorConfig(profile: DetectorProfile, sampleRate: number): DetectorConfig {
  const size = 2 ** Math.ceil(Math.log2(profile.window * sampleRate));
  return { sampleRate, size, minFreq: profile.minFreq, maxFreq: profile.maxFreq };
}
