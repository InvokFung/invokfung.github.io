// Seeded randomness. Jitter, the simulator and the traffic split all draw from
// an injected Rng so that a run is reproducible from its seed.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
}

/** sfc32, seeded through splitmix32. Fast, 128-bit state, passes PractRand to large sizes. */
export function seeded(seed: number | string): Rng {
  let s = typeof seed === "string" ? hashString(seed) : seed >>> 0;
  const split = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = split();
  let b = split();
  let c = split();
  let d = split();
  const rng: Rng = {
    next() {
      const t = (((a + b) >>> 0) + d) >>> 0;
      d = (d + 1) >>> 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) >>> 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) >>> 0;
      return t / 4294967296;
    },
  };
  for (let i = 0; i < 12; i++) rng.next();
  return rng;
}

export const mathRandom: Rng = { next: () => Math.random() };

/** 32-bit FNV-1a over UTF-16 code units, finished with a murmur3 avalanche. */
export function hashString(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export const uniform = (r: Rng, lo: number, hi: number) => lo + (hi - lo) * r.next();

export function normal(r: Rng): number {
  // Box-Muller; 1 - u keeps log away from 0.
  const u = 1 - r.next();
  const v = r.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Log-normal with the given median and log-space sigma. */
export const lognormal = (r: Rng, median: number, sigma: number) => median * Math.exp(sigma * normal(r));

/** Pareto with scale `xm` and shape `alpha`: heavy-tailed, infinite variance for alpha <= 2. */
export const pareto = (r: Rng, xm: number, alpha: number) => xm / Math.pow(1 - r.next(), 1 / alpha);

export const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r.next() * xs.length)];

export function weighted<T extends string>(r: Rng, weights: Readonly<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let x = r.next() * total;
  for (const [k, w] of entries) {
    if ((x -= w) < 0) return k;
  }
  return entries[entries.length - 1][0];
}
