/** Linear-interpolated quantile of an unsorted sample (R-7, the spreadsheet default). */
export function quantile(xs: ArrayLike<number>, q: number): number {
  if (xs.length === 0) return NaN;
  const s = Float64Array.from(xs as ArrayLike<number>).sort();
  return sortedQuantile(s, q);
}

export function sortedQuantile(s: ArrayLike<number>, q: number): number {
  if (s.length === 0) return NaN;
  const pos = (s.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** The last `size` samples, with a quantile that is recomputed at most every `every` inserts. */
export class SampleWindow {
  private buf: Float64Array;
  private n = 0;
  private i = 0;
  private dirty = 0;
  private cache = new Map<number, number>();

  constructor(
    readonly size = 256,
    private readonly every = 8,
  ) {
    this.buf = new Float64Array(size);
  }

  get count(): number {
    return this.n;
  }

  add(x: number): void {
    this.buf[this.i] = x;
    this.i = (this.i + 1) % this.size;
    if (this.n < this.size) this.n++;
    if (++this.dirty >= this.every) {
      this.cache.clear();
      this.dirty = 0;
    }
  }

  quantile(q: number): number {
    const hit = this.cache.get(q);
    if (hit !== undefined) return hit;
    const v = quantile(this.buf.subarray(0, this.n), q);
    this.cache.set(q, v);
    return v;
  }
}

/** Wilson score interval for a binomial proportion (z = 1.96 gives 95%). */
/**
 * A distribution-free lower confidence bound for the q-quantile of the
 * population behind `xs`: the k-th smallest sample, with k the largest index for
 * which P(Binomial(n, q) ≥ k) ≥ conf. With 12 samples, the bound on the p95 is
 * the 10th smallest, so one or two slow outliers cannot fail a latency gate on
 * their own. Null when there are too few samples for any bound.
 */
export function quantileLowerBound(xs: ArrayLike<number>, q: number, conf = 0.95): number | null {
  const n = xs.length;
  if (n === 0) return null;
  // P(X = j) for X ~ Bin(n, q), accumulated from the top: tail(k) = P(X ≥ k).
  const pmf = new Float64Array(n + 1);
  pmf[0] = Math.pow(1 - q, n);
  for (let j = 1; j <= n; j++) pmf[j] = q === 1 ? (j === n ? 1 : 0) : (pmf[j - 1] * (n - j + 1) * q) / (j * (1 - q));
  let tail = 0;
  for (let k = n; k >= 1; k--) {
    tail += pmf[k];
    if (tail >= conf) {
      const s = Float64Array.from(xs as ArrayLike<number>).sort();
      return s[k - 1];
    }
  }
  return null;
}

export function wilson(successes: number, n: number, z = 1.96): { lo: number; hi: number; p: number } {
  if (n === 0) return { lo: 0, hi: 1, p: NaN };
  const p = successes / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const mid = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { lo: Math.max(0, mid - half), hi: Math.min(1, mid + half), p };
}
