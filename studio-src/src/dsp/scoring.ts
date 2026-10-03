import type { SegmentFrame } from "./segmenter";

/**
 * Per-note intonation analysis.
 *
 * - Intonation: the median deviation from the target in cents. Medians ignore
 *   the attack and stray frames. With vibrato, the median is taken of the
 *   vibrato-free centre (below), since a raw median over a partial vibrato
 *   cycle is biased towards wherever the extra half-cycle went.
 * - Drift: how much the note's centre wanders. Vibrato is intended, so it is
 *   removed first with a moving average exactly one vibrato cycle long (a boxcar
 *   has a spectral null at 1/length), then the robust spread (1.4826 × MAD) of
 *   what remains is measured.
 * - Vibrato: rate from the autocorrelation of the detrended contour, depth
 *   (peak, in cents) from its RMS × √2.
 */

export interface NoteAnalysis {
  /** Median deviation from the target, in cents (+ = sharp). */
  cents: number;
  /** Robust spread of the vibrato-free pitch centre, in cents. */
  drift: number;
  vibrato: { rate: number; depth: number } | null;
  duration: number;
  frames: number;
}

export type Rating = "in-tune" | "close" | "sharp" | "flat";

export function median(values: ArrayLike<number>): number {
  const s = Array.from(values).sort((a, b) => a - b);
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) >> 1] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
}

/** Median absolute deviation, scaled to match a standard deviation for normal data. */
export function robustSpread(values: ArrayLike<number>): number {
  const m = median(values);
  return 1.4826 * median(Array.from(values, (v) => Math.abs(v - m)));
}

/** Centred moving average; the window shrinks at the edges. */
export function movingAverage(values: ArrayLike<number>, width: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  const half = Math.max(0, Math.floor(width / 2));
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + values[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    out[i] = (prefix[b] - prefix[a]) / (b - a);
  }
  return out;
}

function vibratoOf(cents: Float64Array, frameRate: number): { rate: number; depth: number } | null {
  const minLag = Math.max(2, Math.floor(frameRate / 9));
  const maxLag = Math.ceil(frameRate / 3);
  if (cents.length < maxLag * 1.5) return null;
  // Remove the slow centre (≈ 0.4 s window) to isolate the oscillation.
  const detrended = movingAverage(cents, Math.round(frameRate * 0.4)).map((v, i) => cents[i] - v);
  // Rate from the autocorrelation of the contour: the first strong peak between
  // 3 and 9 Hz. Unlike counting zero crossings, it weights the stretch where the
  // vibrato is actually present (it usually fades in after the attack).
  const ac = (k: number) => {
    let s = 0;
    for (let i = 0; i + k < detrended.length; i++) s += detrended[i] * detrended[i + k];
    return s / (detrended.length - k);
  };
  const energy = ac(0);
  if (energy <= 0) return null;
  let best = -1;
  for (let k = minLag; k <= maxLag; k++) {
    const v = ac(k);
    if (v > ac(k - 1) && v >= ac(k + 1) && v > 0.3 * energy) {
      best = k;
      break;
    }
  }
  if (best < 0) return null;
  const p = (ac(best - 1) - ac(best + 1)) / (2 * (ac(best - 1) - 2 * ac(best) + ac(best + 1)));
  const rate = frameRate / (best + (Number.isFinite(p) ? Math.max(-1, Math.min(1, p)) : 0));
  const depth = Math.SQRT2 * Math.sqrt(energy);
  return rate >= 3 && rate <= 9 && depth >= 4 ? { rate, depth } : null;
}

export function analyseNote(frames: SegmentFrame[], targetMidi: number, opts: { trimStart?: number; trimEnd?: number } = {}): NoteAnalysis {
  const trimStart = opts.trimStart ?? 0.06;
  const trimEnd = opts.trimEnd ?? 0.04;
  const t0 = frames[0].t;
  const t1 = frames[frames.length - 1].t;
  // Ignore the attack and release when enough of the note is left to judge.
  let core = frames.filter((f) => f.t >= t0 + trimStart && f.t <= t1 - trimEnd);
  if (core.length < 5) core = frames;
  const cents = Float64Array.from(core, (f) => (f.midi - targetMidi) * 100);
  const frameRate = core.length > 1 ? (core.length - 1) / Math.max(1e-3, core[core.length - 1].t - core[0].t) : 90;

  const vibrato = vibratoOf(cents, frameRate);
  // One vibrato cycle long (or ~180 ms) so the oscillation averages to zero.
  const width = Math.max(1, Math.round(frameRate / (vibrato?.rate ?? 5.5)));
  const half = Math.floor(width / 2);
  // Keep only full windows: at the edges the window shrinks and the vibrato leaks back in.
  const centre = cents.length > width + 4 ? movingAverage(cents, width).subarray(half, cents.length - half) : movingAverage(cents, width);
  return {
    // With vibrato, the median of the raw contour is biased by a partial cycle
    // (up to a few cents on a short note); the vibrato-free centre is not.
    cents: vibrato ? median(centre) : median(cents),
    drift: robustSpread(centre),
    vibrato,
    duration: t1 - t0,
    frames: frames.length,
  };
}

export function rate(cents: number): Rating {
  const a = Math.abs(cents);
  if (a <= 5) return "in-tune";
  if (a <= 15) return "close";
  return cents > 0 ? "sharp" : "flat";
}

/**
 * 0..100. Full marks within ±3 cents (about the limit of what a listener notices
 * in a melodic line), nothing beyond ±40. A quarter of the score is steadiness.
 */
export function noteScore(a: Pick<NoteAnalysis, "cents" | "drift">): number {
  const pitch = 1 - Math.min(1, Math.max(0, Math.abs(a.cents) - 3) / 37);
  const steady = 1 - Math.min(1, Math.max(0, a.drift - 3) / 22);
  return Math.round(100 * (0.75 * pitch + 0.25 * steady));
}
