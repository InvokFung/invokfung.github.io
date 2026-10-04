import type { Rng } from "./rng";

/** The exponential ceiling for retry `n` (0-based): min(cap, base * 2^n). */
export const backoffCeiling = (n: number, baseMs: number, capMs: number): number => Math.min(capMs, baseMs * 2 ** n);

/**
 * "Full jitter" (Brooks, AWS Architecture Blog, 2015): sleep a uniform random time
 * in [0, ceiling]. Clients that failed together spread over the whole window
 * instead of retrying in lock-step, which is what turns a blip into a retry storm.
 */
export const fullJitter = (rng: Rng, n: number, baseMs: number, capMs: number): number => rng.next() * backoffCeiling(n, baseMs, capMs);

/**
 * The delay before retry `n`. A server's `retry-after` is a floor, not a
 * suggestion: waiting less only earns another 429.
 */
export function retryDelay(rng: Rng, n: number, baseMs: number, capMs: number, retryAfterMs?: number): number {
  const jitter = fullJitter(rng, n, baseMs, capMs);
  return retryAfterMs !== undefined ? Math.max(jitter, retryAfterMs) : jitter;
}
