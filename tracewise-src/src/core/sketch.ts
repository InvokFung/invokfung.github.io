// DDSketch (Masson, Rim & Lee, VLDB 2019): a quantile sketch with a relative
// error guarantee. A value x lands in bucket k = ceil(log_gamma x) with
// gamma = (1 + a) / (1 - a); every value in a bucket is within a relative
// error a of the bucket's representative 2 gamma^k / (gamma + 1). Counts are
// plain integers, so two sketches merge (and un-merge) exactly, which is what
// the rolling windows in the sampler rely on.

export class DDSketch {
  readonly alpha: number;
  private readonly gamma: number;
  private readonly lnGamma: number;
  /** Values at or below this go to the zero bucket. */
  private readonly minValue: number;
  private readonly maxBuckets: number;
  private counts: Float64Array;
  /** Bucket key of counts[0]. */
  private offset = 0;
  /** Keys present span [lo, hi] (inclusive); empty when hi < lo. */
  private lo = 0;
  private hi = -1;
  zeroCount = 0;
  count = 0;
  sum = 0;
  min = Infinity;
  max = -Infinity;

  constructor(alpha = 0.01, maxBuckets = 2048, minValue = 1e-9) {
    this.alpha = alpha;
    this.gamma = (1 + alpha) / (1 - alpha);
    this.lnGamma = Math.log(this.gamma);
    this.minValue = minValue;
    this.maxBuckets = maxBuckets;
    this.counts = new Float64Array(32);
  }

  key(x: number): number {
    return Math.ceil(Math.log(x) / this.lnGamma);
  }

  /** The representative value of bucket k, within alpha of everything in it. */
  value(k: number): number {
    return (2 * Math.pow(this.gamma, k)) / (this.gamma + 1);
  }

  add(x: number, w = 1): void {
    this.count += w;
    this.sum += x * w;
    if (x < this.min) this.min = x;
    if (x > this.max) this.max = x;
    if (x <= this.minValue) {
      this.zeroCount += w;
      return;
    }
    this.addKey(this.key(x), w);
  }

  private addKey(k: number, w: number): void {
    if (this.hi < this.lo) {
      this.offset = k - (this.counts.length >> 1);
      this.lo = this.hi = k;
    } else if (k < this.lo || k > this.hi) {
      const lo = Math.min(this.lo, k);
      const hi = Math.max(this.hi, k);
      if (hi - lo + 1 > this.maxBuckets) {
        // Collapse the lowest buckets into one: upper quantiles keep their
        // guarantee, which is what latency monitoring needs.
        const newLo = hi - this.maxBuckets + 1;
        if (k < newLo) k = newLo;
        this.collapseBelow(newLo);
      }
      this.ensure(Math.min(this.lo, k), Math.max(this.hi, k));
      this.lo = Math.min(this.lo, k);
      this.hi = Math.max(this.hi, k);
    }
    this.counts[k - this.offset] += w;
  }

  private collapseBelow(newLo: number): void {
    if (this.hi < this.lo || this.lo >= newLo) return;
    let moved = 0;
    for (let k = this.lo; k < Math.min(newLo, this.hi + 1); k++) {
      moved += this.counts[k - this.offset];
      this.counts[k - this.offset] = 0;
    }
    if (newLo > this.hi) {
      this.ensure(newLo, newLo);
      this.hi = newLo;
    }
    this.counts[newLo - this.offset] += moved;
    this.lo = newLo;
  }

  /** Make room for keys lo..hi, re-centring or growing the array. */
  private ensure(lo: number, hi: number): void {
    const n = this.counts.length;
    if (lo - this.offset >= 0 && hi - this.offset < n) return;
    const span = hi - lo + 1;
    let size = n;
    while (size < span * 1.5 + 8) size *= 2;
    const next = new Float64Array(size);
    const newOffset = lo - ((size - span) >> 1);
    if (this.hi >= this.lo) {
      for (let k = this.lo; k <= this.hi; k++) next[k - newOffset] = this.counts[k - this.offset];
    }
    this.counts = next;
    this.offset = newOffset;
  }

  /**
   * The lower q-quantile: an estimate of the item of rank floor(q (n - 1))
   * in sorted order (0-based), within relative error alpha.
   */
  quantile(q: number): number {
    if (this.count <= 0) return NaN;
    const rank = Math.floor(q * (this.count - 1));
    if (rank < this.zeroCount) return Math.max(0, this.min);
    let seen = this.zeroCount;
    for (let k = this.lo; k <= this.hi; k++) {
      seen += this.counts[k - this.offset];
      if (seen > rank) return clamp(this.value(k), this.min, this.max);
    }
    return this.max;
  }

  get mean(): number {
    return this.count > 0 ? this.sum / this.count : NaN;
  }

  /** Number of non-empty buckets: the sketch's memory, in counters. */
  get buckets(): number {
    let b = this.zeroCount > 0 ? 1 : 0;
    for (let k = this.lo; k <= this.hi; k++) if (this.counts[k - this.offset] > 0) b++;
    return b;
  }

  forEach(fn: (key: number, count: number) => void): void {
    for (let k = this.lo; k <= this.hi; k++) {
      const c = this.counts[k - this.offset];
      if (c !== 0) fn(k, c);
    }
  }

  merge(other: DDSketch): void {
    this.checkCompatible(other);
    if (other.count === 0) return;
    other.forEach((k, c) => this.addKey(k, c));
    this.zeroCount += other.zeroCount;
    this.count += other.count;
    this.sum += other.sum;
    this.min = Math.min(this.min, other.min);
    this.max = Math.max(this.max, other.max);
  }

  /**
   * Remove a sketch previously merged in, for sliding windows. Counts are
   * exact, so quantiles are exactly those of the remaining data; min and max
   * become bounds rather than exact values.
   */
  subtract(other: DDSketch): void {
    this.checkCompatible(other);
    other.forEach((k, c) => {
      if (k >= this.lo && k <= this.hi) this.counts[k - this.offset] = Math.max(0, this.counts[k - this.offset] - c);
    });
    this.zeroCount = Math.max(0, this.zeroCount - other.zeroCount);
    this.count = Math.max(0, this.count - other.count);
    this.sum -= other.sum;
    if (this.count === 0) this.clear();
    else {
      while (this.lo <= this.hi && this.counts[this.lo - this.offset] === 0) this.lo++;
      while (this.hi >= this.lo && this.counts[this.hi - this.offset] === 0) this.hi--;
      // Bucket k holds values in (gamma^(k-1), gamma^k], so these stay valid bounds.
      if (this.hi >= this.lo) {
        if (this.zeroCount === 0) this.min = Math.max(this.min, Math.pow(this.gamma, this.lo - 1));
        this.max = Math.min(this.max, Math.pow(this.gamma, this.hi));
      }
    }
  }

  clear(): void {
    this.counts.fill(0);
    this.lo = 0;
    this.hi = -1;
    this.zeroCount = 0;
    this.count = 0;
    this.sum = 0;
    this.min = Infinity;
    this.max = -Infinity;
  }

  clone(): DDSketch {
    const s = new DDSketch(this.alpha, this.maxBuckets, this.minValue);
    s.merge(this);
    return s;
  }

  private checkCompatible(o: DDSketch): void {
    if (o.alpha !== this.alpha) throw new Error("cannot merge sketches with different accuracy");
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** The exact lower quantile with the same rank definition, for comparisons. */
export function exactQuantile(sorted: ArrayLike<number>, q: number): number {
  return sorted[Math.floor(q * (sorted.length - 1))];
}
