// Tail-based sampling: decide per trace after it has finished, when its
// outcome is known. Keep every trace that contains an error, every trace
// slower than its endpoint's rolling p99, and a rate-limited sample of the
// rest. The p99 comes from a sliding window of DDSketches, one per minute.

import { DDSketch } from "./sketch";

export type KeepReason = "error" | "slow" | "sampled";

export interface SamplerOptions {
  /** Steady rate of ordinary traces kept, per simulated second, across all flows. */
  ratePerSec: number;
  /** Token-bucket size: how many ordinary traces may be kept in a burst. */
  burst: number;
  /** Minutes in the rolling p99 window. */
  windowMin: number;
  /** Traces needed in the window before the slow rule applies. */
  minForP99: number;
}

export const DEFAULT_SAMPLER: SamplerOptions = { ratePerSec: 0.5, burst: 10, windowMin: 10, minForP99: 200 };

/** A sliding window of per-minute sketches whose sum is kept up to date by merge and subtract. */
export class RollingSketch {
  private ring: DDSketch[] = [];
  readonly total: DDSketch;
  current: DDSketch;

  constructor(
    readonly minutes: number,
    readonly alpha = 0.01,
  ) {
    this.total = new DDSketch(alpha);
    this.current = new DDSketch(alpha);
  }

  add(x: number): void {
    this.current.add(x);
  }

  /** Close the current minute: it joins the window and the oldest minute leaves. */
  roll(): void {
    this.total.merge(this.current);
    this.ring.push(this.current);
    if (this.ring.length > this.minutes) this.total.subtract(this.ring.shift()!);
    this.current = new DDSketch(this.alpha);
  }
}

export class TailSampler {
  private windows = new Map<string, RollingSketch>();
  private tokens: number;
  private lastMs = 0;
  seen = 0;
  kept = 0;
  byReason: Record<KeepReason, number> = { error: 0, slow: 0, sampled: 0 };

  constructor(readonly opts: SamplerOptions = DEFAULT_SAMPLER) {
    this.tokens = opts.burst;
  }

  private window(flow: string): RollingSketch {
    let w = this.windows.get(flow);
    if (!w) this.windows.set(flow, (w = new RollingSketch(this.opts.windowMin)));
    return w;
  }

  /** The current slow threshold for a flow, or null while the window is too thin. */
  p99(flow: string): number | null {
    const w = this.windows.get(flow);
    if (!w || w.total.count < this.opts.minForP99) return null;
    return w.total.quantile(0.99);
  }

  /** Decide one finished trace. Returns why it is kept, or null to drop it. */
  decide(flow: string, durMs: number, hasError: boolean, nowMs: number): KeepReason | null {
    this.seen++;
    const w = this.window(flow);
    const threshold = this.p99(flow);
    w.add(durMs);
    // Refill the token bucket on simulated time.
    this.tokens = Math.min(this.opts.burst, this.tokens + ((nowMs - this.lastMs) / 1000) * this.opts.ratePerSec);
    this.lastMs = nowMs;
    let reason: KeepReason | null = null;
    if (hasError) reason = "error";
    else if (threshold !== null && durMs > threshold) reason = "slow";
    else if (this.tokens >= 1) {
      this.tokens -= 1;
      reason = "sampled";
    }
    if (reason) {
      this.kept++;
      this.byReason[reason]++;
    }
    return reason;
  }

  /** Advance every flow's window by a minute. */
  roll(): void {
    for (const w of this.windows.values()) w.roll();
  }
}
