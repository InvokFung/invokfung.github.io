// Streaming anomaly detection on one-minute series: an EWMA forecast, a robust
// z-score of the residual scaled by the median absolute deviation, and a
// one-sided CUSUM on that z-score to catch sustained level shifts that a
// single-point threshold would miss.

export class Ewma {
  value = NaN;
  n = 0;
  constructor(readonly alpha: number) {
    if (!(alpha > 0 && alpha <= 1)) throw new Error("alpha must be in (0, 1]");
  }
  update(x: number): number {
    this.value = this.n === 0 ? x : this.alpha * x + (1 - this.alpha) * this.value;
    this.n++;
    return this.value;
  }
}

/** EWMA smoothing factor for a given half-life in samples. */
export const alphaForHalfLife = (h: number) => 1 - Math.pow(0.5, 1 / h);

export function median(xs: ArrayLike<number>): number {
  const n = xs.length;
  if (!n) return NaN;
  const s = Float64Array.from(xs).sort();
  return n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** Median absolute deviation from the median (unscaled). */
export function mad(xs: ArrayLike<number>, center = median(xs)): number {
  const d = new Float64Array(xs.length);
  for (let i = 0; i < xs.length; i++) d[i] = Math.abs(xs[i] - center);
  return median(d);
}

/** 1.4826 * MAD estimates the standard deviation of normal data. */
export const MAD_SIGMA = 1.4826;

/** Robust z-score of x against a reference sample, with a floor on the scale. */
export function robustZ(x: number, sample: ArrayLike<number>, minScale = 1e-9): number {
  if (!sample.length) return 0;
  const m = median(sample);
  const s = Math.max(MAD_SIGMA * mad(sample, m), minScale);
  return (x - m) / s;
}

export interface CusumOptions {
  /** Allowance (slack) in units of sigma; shifts smaller than about 2k are ignored. */
  k: number;
  /** Decision threshold in units of sigma. */
  h: number;
  /** Largest single-step contribution, so one outlier cannot alarm alone. */
  cap?: number;
  /** Upper bound on the statistic, so it recovers quickly after a shift ends. */
  ceiling?: number;
}

/** One-sided (upward) CUSUM on standardized values. */
export class Cusum {
  s = 0;
  /** Index at which the statistic last left zero: the change-point estimate. */
  start = -1;
  private i = -1;
  constructor(readonly opts: CusumOptions) {}

  update(z: number, index = this.i + 1): { s: number; alarm: boolean; onset: number } {
    this.i = index;
    const step = Math.min(z, this.opts.cap ?? Infinity) - this.opts.k;
    const prev = this.s;
    this.s = Math.min(Math.max(0, prev + step), this.opts.ceiling ?? Infinity);
    if (prev === 0 && this.s > 0) this.start = index;
    if (this.s === 0) this.start = -1;
    return { s: this.s, alarm: this.s > this.opts.h, onset: this.start };
  }

  reset(): void {
    this.s = 0;
    this.start = -1;
  }
}

export interface DetectorOptions {
  /** EWMA half-life of the forecast, in samples. */
  halfLife: number;
  /** Residuals kept for the MAD scale. */
  window: number;
  /** Samples needed before the detector may alarm. */
  warmup: number;
  /** Absolute floor on the residual scale. */
  minScale: number;
  cusum: CusumOptions;
  /** Residuals beyond this many sigma are clipped before they update the baseline. */
  gate: number;
}

export interface DetectorStep {
  forecast: number;
  z: number;
  s: number;
  alarm: boolean;
  /** Sample index where the shift began, or -1. */
  onset: number;
}

const QUIET: DetectorStep = { forecast: NaN, z: 0, s: 0, alarm: false, onset: -1 };

/**
 * EWMA forecast + MAD-scaled residual z + CUSUM, for a continuous signal such
 * as log latency. While the series looks anomalous the baseline learns only a
 * clipped value, and nothing during an alarm, so a sustained fault does not
 * quietly become the new normal.
 */
export class SeriesDetector {
  private ewma: Ewma;
  private resid: number[] = [];
  private cusum: Cusum;
  n = 0;
  last: DetectorStep = QUIET;

  constructor(readonly opts: DetectorOptions) {
    this.ewma = new Ewma(alphaForHalfLife(opts.halfLife));
    this.cusum = new Cusum(opts.cusum);
  }

  /** Robust sigma of recent residuals, floored. */
  scale(): number {
    if (this.resid.length < 3) return this.opts.minScale * 3;
    return Math.max(MAD_SIGMA * mad(this.resid), this.opts.minScale);
  }

  update(x: number): DetectorStep {
    const i = this.n++;
    if (!Number.isFinite(x)) return (this.last = { ...this.last, z: 0 });
    const f = this.ewma.n ? this.ewma.value : x;
    const r = x - f;
    const sigma = this.scale();
    const center = this.resid.length >= 3 ? median(this.resid) : 0;
    const z = i < 2 ? 0 : (r - center) / sigma;
    const c = i >= this.opts.warmup ? this.cusum.update(z, i) : { s: 0, alarm: false, onset: -1 };
    if (!c.alarm) {
      const g = this.opts.gate * sigma;
      const rc = Math.max(center - g, Math.min(center + g, r));
      this.ewma.update(f + rc);
      this.resid.push(rc);
      if (this.resid.length > this.opts.window) this.resid.shift();
    }
    return (this.last = { forecast: f, z, s: c.s, alarm: c.alarm, onset: c.onset });
  }

  /** Clear the CUSUM once its alert has resolved, so the next shift is timed from scratch. */
  rearm(): void {
    this.cusum.reset();
  }
}

export interface RateDetectorOptions {
  halfLife: number;
  warmup: number;
  /** Floor on the baseline ratio, so a clean baseline does not make one error look infinite. */
  floor: number;
  cusum: CusumOptions;
  gate: number;
}

/**
 * The same idea for a ratio of counts (errors / requests): the z-score is
 * binomial, so a minute with few requests needs more errors to look unusual.
 */
export class RateDetector {
  private ewma: Ewma;
  private cusum: Cusum;
  n = 0;
  last: DetectorStep = QUIET;

  constructor(readonly opts: RateDetectorOptions) {
    this.ewma = new Ewma(alphaForHalfLife(opts.halfLife));
    this.cusum = new Cusum(opts.cusum);
  }

  baseline(): number {
    return Math.max(this.ewma.n ? this.ewma.value : 0, this.opts.floor);
  }

  update(errors: number, total: number): DetectorStep {
    const i = this.n++;
    if (total <= 0) return (this.last = { ...this.last, z: 0 });
    const p0 = this.baseline();
    const z = binomialZ(errors, total, p0);
    const c = i >= this.opts.warmup ? this.cusum.update(z, i) : { s: 0, alarm: false, onset: -1 };
    if (!c.alarm) {
      // Clip the observed ratio to the gate before learning from it.
      const sd = Math.sqrt((p0 * (1 - p0)) / total);
      this.ewma.update(Math.min(errors / total, p0 + this.opts.gate * sd));
    }
    return (this.last = { forecast: p0, z, s: c.s, alarm: c.alarm, onset: c.onset });
  }

  rearm(): void {
    this.cusum.reset();
  }
}

/**
 * Binomial z-score of `errors` out of `n` against a baseline ratio p0: how
 * surprising this minute's error count is, accounting for sample size.
 */
export function binomialZ(errors: number, n: number, p0: number): number {
  if (n <= 0) return 0;
  const p = Math.min(Math.max(p0, 1e-6), 1 - 1e-6);
  return (errors - n * p) / Math.sqrt(n * p * (1 - p));
}
