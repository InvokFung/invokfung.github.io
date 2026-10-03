import type { Scheduler } from "./ports";

/** Real timers; works in Node and in browsers/workers (both expose these globals). */
export function systemScheduler(host: {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: never): void;
  performance: { now(): number };
}): Scheduler {
  // Detach the functions: browsers throw "Illegal invocation" when the timer functions
  // are called as methods of some other object.
  const { setTimeout: set, clearTimeout: clear, performance: perf } = host;
  return {
    now: () => Date.now(),
    monotonic: () => perf.now(),
    setTimeout: (fn, ms) => set(fn, ms),
    clearTimeout: (h) => clear(h as never),
  };
}

/**
 * Deterministic virtual clock for tests: timers fire only when `advance` moves time
 * past them, in due order (ties in creation order).
 */
export class ManualScheduler implements Scheduler {
  private t: number;
  private nextId = 1;
  private readonly timers = new Map<number, { at: number; fn: () => void }>();

  constructor(start = 1_700_000_000_000) {
    this.t = start;
  }

  now(): number {
    return this.t;
  }
  monotonic(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { at: this.t + Math.max(0, ms), fn });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }
  get pending(): number {
    return this.timers.size;
  }

  /** Move time forward, firing due timers; awaits microtasks between timers so promise chains settle. */
  async advance(ms: number): Promise<void> {
    const end = this.t + ms;
    for (;;) {
      await settle();
      let next: [number, { at: number; fn: () => void }] | undefined;
      for (const entry of this.timers) if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = Math.max(this.t, next[1].at);
      next[1].fn();
    }
    this.t = end;
    await settle();
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
