import { sha256Words } from "./sha256";

/**
 * Seeded PRNG (xoshiro128**). Same seed, same sequence, on every runtime.
 * Used for dealing (seeded from the match's secret seed) and for bot decisions
 * (seeded from public ids, so a bot can never learn the deal from its RNG).
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Uniform integer in [min, max] (both inclusive). */
  between(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createRng(seedWords: ArrayLike<number>): Rng {
  let s0 = seedWords[0] >>> 0;
  let s1 = seedWords[1] >>> 0;
  let s2 = seedWords[2] >>> 0;
  let s3 = seedWords[3] >>> 0;
  if ((s0 | s1 | s2 | s3) === 0) s0 = 0x9e3779b9; // the all-zero state is a fixed point

  const nextU32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  };

  const rng: Rng = {
    next: () => nextU32() / 0x100000000,
    int: (maxExclusive) => {
      if (!(maxExclusive > 0)) throw new RangeError(`int(${maxExclusive})`);
      return Math.floor(rng.next() * maxExclusive);
    },
    between: (min, max) => min + rng.int(max - min + 1),
    pick: (items) => {
      if (items.length === 0) throw new RangeError("pick() from an empty list");
      return items[rng.int(items.length)] as (typeof items)[number];
    },
  };
  return rng;
}

/** Derive the 128-bit PRNG state from any string through SHA-256. */
export function rngFromSeed(seed: string): Rng {
  return createRng(sha256Words(seed));
}

/** In-place Fisher-Yates shuffle driven by a seeded RNG. */
export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
  return items;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
