// Time is injected. The gateway, the simulator and the canary controller never
// read a wall clock directly, so the same code runs in real time on the page and
// in virtual time in tests and benchmarks (thousands of requests with
// heavy-tailed latencies finish in well under a second, deterministically).

import { clearTimer, hrnow, macrotask, setTimer, type AbortSignalLike } from "./platform";

export interface Timer {
  cancel(): void;
}

export interface Clock {
  /** Milliseconds, monotonic. */
  now(): number;
  setTimer(fn: () => void, ms: number): Timer;
}

export const systemClock: Clock = {
  now: hrnow,
  setTimer(fn, ms) {
    const id = setTimer(fn, Math.max(0, ms));
    return { cancel: () => clearTimer(id) };
  },
};

export class AbortError extends Error {
  constructor(readonly reason?: unknown) {
    super("aborted");
    this.name = "AbortError";
  }
}

export const isAbort = (e: unknown): e is AbortError => e instanceof AbortError;

/** Resolves after `ms` on `clock`; rejects with AbortError as soon as `signal` aborts. */
export function sleep(clock: Clock, ms: number, signal?: AbortSignalLike): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError(signal.reason));
    const onAbort = () => {
      timer.cancel();
      reject(new AbortError(signal?.reason));
    };
    const timer = clock.setTimer(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

interface Entry {
  at: number;
  seq: number;
  fn: () => void;
  live: boolean;
}

/**
 * A discrete-event clock. Timers fire in (time, insertion) order; between two
 * timers the host gets a macrotask turn, so every promise continuation caused by
 * the previous timer has run before virtual time moves again.
 */
export class VirtualClock implements Clock {
  private t = 0;
  private seq = 0;
  private heap: Entry[] = [];
  fired = 0;

  constructor(private readonly yieldToHost: () => Promise<void> = macrotask) {}

  now(): number {
    return this.t;
  }

  setTimer(fn: () => void, ms: number): Timer {
    const e: Entry = { at: this.t + Math.max(0, ms), seq: this.seq++, fn, live: true };
    this.push(e);
    return { cancel: () => void (e.live = false) };
  }

  get pending(): number {
    return this.heap.reduce((n, e) => n + (e.live ? 1 : 0), 0);
  }

  /** Runs timers until none are left, `until()` turns true, or virtual time would pass `limit`. */
  async run(opts: { until?: () => boolean; limit?: number } = {}): Promise<void> {
    for (;;) {
      await this.yieldToHost();
      if (opts.until?.()) return;
      const e = this.pop();
      if (!e) {
        if (opts.limit !== undefined && opts.limit > this.t) this.t = opts.limit;
        return;
      }
      if (opts.limit !== undefined && e.at > opts.limit) {
        this.push(e);
        this.t = opts.limit;
        return;
      }
      this.t = e.at;
      this.fired++;
      e.fn();
    }
  }

  /** Moves time forward by `ms`, firing everything due on the way. */
  advance(ms: number): Promise<void> {
    return this.run({ limit: this.t + ms });
  }

  private push(e: Entry): void {
    const h = this.heap;
    h.push(e);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }

  private pop(): Entry | undefined {
    const h = this.heap;
    while (h.length) {
      const top = h[0];
      const last = h.pop()!;
      if (h.length) {
        h[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < h.length && less(h[l], h[m])) m = l;
          if (r < h.length && less(h[r], h[m])) m = r;
          if (m === i) break;
          [h[i], h[m]] = [h[m], h[i]];
          i = m;
        }
      }
      if (top.live) return top;
    }
    return undefined;
  }
}

const less = (a: Entry, b: Entry) => a.at < b.at || (a.at === b.at && a.seq < b.seq);
