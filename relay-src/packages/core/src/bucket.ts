/**
 * A token bucket with lazy refill: `capacity` tokens, refilled continuously at
 * `capacity / periodMs`. Nothing runs between calls; each call settles the refill
 * owed since the last one.
 *
 * `take` is all-or-nothing and reports how long until the request would fit, which
 * becomes the `retry-after` header. `settle` reconciles an estimate after the fact:
 * a request that used more tokens than it reserved can push the level below zero
 * (debt), and later requests wait for the debt to refill.
 */
export class TokenBucket {
  private level: number;
  private last: number;

  constructor(
    readonly capacity: number,
    readonly periodMs: number,
    now: number,
  ) {
    if (!(capacity > 0) || !(periodMs > 0)) throw new Error("capacity and period must be positive");
    this.level = capacity;
    this.last = now;
  }

  get ratePerMs(): number {
    return this.capacity / this.periodMs;
  }

  private refill(now: number): void {
    if (now > this.last) {
      this.level = Math.min(this.capacity, this.level + (now - this.last) * this.ratePerMs);
      this.last = now;
    }
  }

  available(now: number): number {
    this.refill(now);
    return this.level;
  }

  /** Takes `n` tokens if they are all there. Otherwise takes nothing and says when to retry. */
  take(n: number, now: number): { ok: true; remaining: number } | { ok: false; retryAfterMs: number; remaining: number } {
    this.refill(now);
    if (n > this.capacity) return { ok: false, retryAfterMs: Infinity, remaining: this.level };
    if (this.level >= n) {
      this.level -= n;
      return { ok: true, remaining: this.level };
    }
    return { ok: false, retryAfterMs: Math.ceil((n - this.level) / this.ratePerMs), remaining: this.level };
  }

  /** Adjusts by `delta` tokens after the fact: positive charges more (may go into debt), negative refunds. */
  settle(delta: number, now: number): void {
    this.refill(now);
    this.level = Math.min(this.capacity, this.level - delta);
  }
}

/**
 * Admits a fraction of extra work relative to normal work (hedges, here): each
 * request deposits `ratio` credits, each hedge spends one. Over any long stretch
 * hedges stay under `ratio` of requests; `burst` bounds how many can go at once.
 */
export class RatioBudget {
  private credits: number;
  constructor(
    readonly ratio: number,
    readonly burst = 10,
  ) {
    this.credits = burst;
  }
  deposit(): void {
    this.credits = Math.min(this.burst, this.credits + this.ratio);
  }
  trySpend(): boolean {
    if (this.credits < 1) return false;
    this.credits -= 1;
    return true;
  }
}
