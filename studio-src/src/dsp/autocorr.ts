import { FFT, nextPow2 } from "./fft";

/**
 * The two sums both detectors are built from, for a frame x of length W:
 *
 *   r′(τ) = Σ_{j=0}^{W-1-τ} x[j]·x[j+τ]              (autocorrelation over the overlap)
 *   m′(τ) = Σ_{j=0}^{W-1-τ} (x[j]² + x[j+τ]²)        (energy of the two overlapping parts)
 *
 * r′ comes from the Wiener–Khinchin theorem: zero-pad to N = 2W so circular
 * correlation equals linear correlation, take |FFT|², transform back. Both
 * signals are real, so each length-N transform is done as one length-N/2
 * complex FFT (even samples in the real part, odd samples in the imaginary
 * part) plus an O(N) split, which halves the work. m′ is a running sum in O(W).
 */
export class Autocorrelator {
  readonly windowSize: number;
  /** Length of the zero-padded real transform (N = 2W rounded up to a power of two). */
  readonly n: number;
  private readonly fft: FFT;
  private readonly zr: Float64Array;
  private readonly zi: Float64Array;
  private readonly power: Float64Array;
  private readonly wc: Float64Array;
  private readonly ws: Float64Array;
  private readonly xc: Float64Array;

  constructor(windowSize: number) {
    this.windowSize = windowSize;
    this.n = nextPow2(2 * windowSize);
    const h = this.n / 2;
    this.fft = new FFT(h);
    this.zr = new Float64Array(h);
    this.zi = new Float64Array(h);
    this.power = new Float64Array(h + 1);
    this.wc = new Float64Array(h + 1);
    this.ws = new Float64Array(h + 1);
    for (let k = 0; k <= h; k++) {
      this.wc[k] = Math.cos((2 * Math.PI * k) / this.n);
      this.ws[k] = Math.sin((2 * Math.PI * k) / this.n);
    }
    this.xc = new Float64Array(windowSize);
  }

  /**
   * Fills r[0..maxLag] and m[0..maxLag] for the mean-removed frame and returns
   * the frame's energy Σx². r and m must hold at least maxLag + 1 values.
   */
  compute(x: ArrayLike<number>, r: Float64Array, m: Float64Array, maxLag: number): number {
    const W = this.windowSize;
    const h = this.n / 2;
    const { zr, zi, power: P, wc, ws, xc } = this;

    let mean = 0;
    for (let i = 0; i < W; i++) mean += x[i];
    mean /= W;
    let energy = 0;
    for (let i = 0; i < W; i++) {
      const v = x[i] - mean;
      xc[i] = v;
      energy += v * v;
    }

    // Pack: z[j] = x[2j] + i·x[2j+1], zero beyond the frame.
    for (let j = 0; j < h; j++) {
      const e = 2 * j;
      zr[j] = e < W ? xc[e] : 0;
      zi[j] = e + 1 < W ? xc[e + 1] : 0;
    }
    this.fft.transform(zr, zi);

    // Split: X[k] = E[k] + e^{-2πik/N}·O[k], with E, O the spectra of the even and odd samples.
    for (let k = 0; k <= h; k++) {
      const a = k === h ? 0 : k;
      const b = k === 0 ? 0 : h - k;
      const ar = zr[a];
      const ai = zi[a];
      const br = zr[b];
      const bi = -zi[b]; // conj(Z[h−k])
      const er = 0.5 * (ar + br);
      const ei = 0.5 * (ai + bi);
      // O = (Z[k] − conj Z[h−k]) / 2i
      const or = 0.5 * (ai - bi);
      const oi = -0.5 * (ar - br);
      const c = wc[k];
      const s = -ws[k];
      const xr = er + c * or - s * oi;
      const xi = ei + c * oi + s * or;
      P[k] = xr * xr + xi * xi;
    }

    // Inverse of the real, even power spectrum, packed the same way:
    // E[k] = (P[k] + P[h−k]) / 2, O[k] = (P[k] − P[h−k]) / 2 · e^{+2πik/N}, Z = E + i·O.
    for (let k = 0; k < h; k++) {
      const e = 0.5 * (P[k] + P[h - k]);
      const d = 0.5 * (P[k] - P[h - k]);
      const or = d * wc[k];
      const oi = d * ws[k];
      zr[k] = e - oi;
      zi[k] = or;
    }
    this.fft.transform(zr, zi, true);

    const L = Math.min(maxLag, W - 1);
    for (let t = 0; t <= L; t++) r[t] = (t & 1) === 0 ? zr[t >> 1] : zi[t >> 1];

    // m′(0) = 2Σx², then drop the two samples that leave the overlap at each lag.
    m[0] = 2 * energy;
    for (let t = 1; t <= L; t++) {
      const a = xc[t - 1];
      const b = xc[W - t];
      m[t] = m[t - 1] - a * a - b * b;
    }
    return energy;
  }
}

/** Direct O(W·τ) reference implementation, used by the tests to check the FFT path. */
export function autocorrNaive(x: ArrayLike<number>, maxLag: number): Float64Array {
  const W = x.length;
  let mean = 0;
  for (let i = 0; i < W; i++) mean += x[i];
  mean /= W;
  const r = new Float64Array(maxLag + 1);
  for (let t = 0; t <= maxLag; t++) {
    let s = 0;
    for (let j = 0; j < W - t; j++) s += (x[j] - mean) * (x[j + t] - mean);
    r[t] = s;
  }
  return r;
}
