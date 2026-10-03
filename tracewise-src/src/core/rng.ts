// Seeded random numbers: xoshiro128** seeded through splitmix32, so a seed
// reproduces a simulation exactly in the browser and in Node.

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  private spare: number | null = null;

  constructor(seed: number) {
    const sm = splitmix32(seed);
    this.a = sm();
    this.b = sm();
    this.c = sm();
    this.d = sm();
    if ((this.a | this.b | this.c | this.d) === 0) this.a = 1;
  }

  /** A uniform 32-bit unsigned integer. */
  u32(): number {
    const result = Math.imul(rotl(Math.imul(this.b, 5), 7), 9) >>> 0;
    const t = this.b << 9;
    this.c ^= this.a;
    this.d ^= this.b;
    this.b ^= this.c;
    this.a ^= this.d;
    this.c ^= t;
    this.d = rotl(this.d, 11);
    return result;
  }

  /** Uniform in [0, 1). */
  float(): number {
    return this.u32() / 4294967296;
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.float() * n);
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.float();
  }

  /** Log-uniform in [lo, hi]: equal odds for each order of magnitude. */
  logRange(lo: number, hi: number): number {
    return Math.exp(this.range(Math.log(lo), Math.log(hi)));
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(xs: readonly T[]): T {
    return xs[this.int(xs.length)];
  }

  /** Standard normal by the Box-Muller transform, caching the second value. */
  normal(): number {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = this.float();
    const v = this.float();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }

  /** Lognormal with the given median and log-space standard deviation. */
  lognormal(median: number, sigma: number): number {
    return median * Math.exp(sigma * this.normal());
  }

  /** Exponential with the given rate. */
  exp(rate: number): number {
    return -Math.log(1 - this.float()) / rate;
  }

  /** Random lowercase hex id of `bytes` bytes, the format OTel uses for trace and span ids. */
  hexId(bytes: number): string {
    let s = "";
    for (let i = 0; i < bytes; i += 4) {
      const x = this.u32();
      s += HEX[x & 255] + HEX[(x >>> 8) & 255] + HEX[(x >>> 16) & 255] + HEX[x >>> 24];
    }
    return s;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
