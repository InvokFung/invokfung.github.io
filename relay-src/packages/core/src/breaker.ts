import { wilson } from "./stats";
import type { BreakerConfig } from "./types";

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerTransition {
  from: BreakerState;
  to: BreakerState;
  at: number;
  reason: string;
}

/**
 * Per-upstream circuit breaker.
 *
 * - closed: everything passes; outcomes go into a rolling window of the last
 *   `window` calls. It opens once the window holds `minRequests` and the 95%
 *   Wilson lower bound of the failure share reaches `failureRate`: a hard outage
 *   (8 failures out of 8) trips it, while an upstream with a steady 30% error
 *   rate does not trip on an unlucky run of 10 failures in 20, which a raw
 *   share would. Opening on noise takes healthy capacity away.
 * - open: nothing passes until the cooldown ends. Each re-trip doubles the
 *   cooldown up to `maxCooldownMs`, so a flapping upstream is probed less often.
 * - half-open: exactly one probe at a time. `probes` consecutive successes close
 *   it (and reset the cooldown); any failure re-opens it.
 *
 * `allow` is a question, `acquire` is a commitment: only `acquire` takes the
 * half-open probe slot, and every acquired call must end in `success`,
 * `failure` or `release` (cancelled, say a hedge loser), which frees the slot
 * without counting.
 */
export class CircuitBreaker {
  state: BreakerState = "closed";
  private outcomes: boolean[] = [];
  private failures = 0;
  private openedAt = 0;
  private cooldown: number;
  private probeInFlight = false;
  private probeSuccesses = 0;
  trips = 0;

  constructor(
    readonly id: string,
    readonly cfg: BreakerConfig,
    private readonly onTransition?: (t: BreakerTransition) => void,
  ) {
    this.cooldown = cfg.cooldownMs;
  }

  /** Would a call be let through right now? Moves open to half-open when the cooldown is over. */
  allow(now: number): boolean {
    if (this.state === "open" && now - this.openedAt >= this.cooldown) this.move("half-open", now, "cooldown elapsed");
    if (this.state === "open") return false;
    if (this.state === "half-open") return !this.probeInFlight;
    return true;
  }

  /** Takes permission for one call. In half-open this is the single probe slot. */
  acquire(now: number): boolean {
    if (!this.allow(now)) return false;
    if (this.state === "half-open") this.probeInFlight = true;
    return true;
  }

  /** When an open breaker will next admit a probe. */
  retryAt(): number {
    return this.state === "open" ? this.openedAt + this.cooldown : 0;
  }

  get failureRate(): number {
    return this.outcomes.length ? this.failures / this.outcomes.length : 0;
  }

  success(now: number): void {
    if (this.state === "half-open") {
      this.probeInFlight = false;
      if (++this.probeSuccesses >= this.cfg.probes) {
        this.cooldown = this.cfg.cooldownMs;
        this.move("closed", now, `${this.probeSuccesses} probe${this.probeSuccesses > 1 ? "s" : ""} succeeded`);
      }
      return;
    }
    if (this.state === "closed") this.record(true, now);
  }

  failure(now: number): void {
    if (this.state === "half-open") {
      this.probeInFlight = false;
      this.cooldown = Math.min(this.cfg.maxCooldownMs, this.cooldown * 2);
      this.open(now, "probe failed");
      return;
    }
    if (this.state === "closed") this.record(false, now);
  }

  /** The acquired call ended without a verdict (cancelled). */
  release(): void {
    if (this.state === "half-open") this.probeInFlight = false;
  }

  private record(ok: boolean, now: number): void {
    this.outcomes.push(ok);
    if (!ok) this.failures++;
    if (this.outcomes.length > this.cfg.window && !this.outcomes.shift()) this.failures--;
    if (this.outcomes.length < this.cfg.minRequests) return;
    const lo = wilson(this.failures, this.outcomes.length).lo;
    if (lo >= this.cfg.failureRate) this.open(now, `${Math.round(this.failureRate * 100)}% of last ${this.outcomes.length} failed (95% lower bound ${Math.round(lo * 100)}%)`);
  }

  private open(now: number, reason: string): void {
    this.openedAt = now;
    this.trips++;
    this.move("open", now, reason);
  }

  private move(to: BreakerState, at: number, reason: string): void {
    const from = this.state;
    this.state = to;
    if (to === "closed" || to === "open") {
      this.outcomes = [];
      this.failures = 0;
    }
    if (to === "half-open") this.probeSuccesses = 0;
    this.onTransition?.({ from, to, at, reason });
  }
}
