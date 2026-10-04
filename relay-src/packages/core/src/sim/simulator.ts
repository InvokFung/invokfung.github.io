// A deterministic mock LLM upstream.
//
// Latency: time to first token is log-normal around a median, plus, with
// probability `tail.p`, a Lomax (shifted Pareto) delay: rare but very long,
// which is the shape that makes p99 hard. Tokens then stream at `tokensPerSec`
// with ±30% jitter, a few tokens per chunk.
//
// Failures (with probability `failRate`, mixed by `mix`): 500 api_error,
// 429 with retry-after, 529 overloaded, a stall (accepted, then silence) and a
// dropped stream (cut off part-way, sometimes before the first token).
//
// Every call draws from its own RNG seeded by (upstream, call number), so a run
// is reproducible from its seed, and aborting a call stops its generator.

import { sleep, type Clock } from "../clock";
import { UpstreamError } from "../errors";
import type { AbortSignalLike } from "../platform";
import { hashString, lognormal, pareto, seeded, weighted, type Rng } from "../rng";
import { modelInfo } from "../routing";
import { estimateMessages } from "../tokens";
import { tierRank, type ModelInfo, type StreamEvent, type Upstream, type UpstreamCall } from "../types";
import { simTokens, think } from "./brain";

export interface SimProfile {
  ttfbMedianMs: number;
  /** Log-space sigma of the log-normal body. */
  ttfbSigma: number;
  tail: { p: number; scaleMs: number; alpha: number };
  tokensPerSec: number;
  failRate: number;
  mix: { error500: number; rate429: number; overloaded529: number; stall: number; drop: number };
  /** No waiting at all: for measuring the gateway's own overhead. */
  zeroLatency?: boolean;
  retryAfterMs?: number;
}

export const DEFAULT_MIX: SimProfile["mix"] = { error500: 0.35, rate429: 0.2, overloaded529: 0.2, stall: 0.15, drop: 0.1 };

export interface SimCallLog {
  call: number;
  outcome: "completed" | "failed" | "cancelled" | "pending";
  failure?: string;
  tokens: number;
}

export class SimUpstream implements Upstream {
  readonly kind = "simulator" as const;
  readonly id: string;
  private calls = 0;
  readonly log: SimCallLog[] = [];
  stats = { calls: 0, completed: 0, failed: 0, cancelled: 0, tokens: 0 };
  private readonly info: ModelInfo | undefined;

  constructor(
    readonly model: string,
    readonly region: string,
    private readonly clock: Clock,
    public profile: () => SimProfile,
    private readonly seed = 1,
  ) {
    this.id = `${region}/${model}`;
    this.info = modelInfo(model);
  }

  async open(call: UpstreamCall): Promise<AsyncIterable<StreamEvent>> {
    const n = ++this.calls;
    const rng = seeded((hashString(this.id) ^ Math.imul(n, 0x9e3779b1) ^ Math.imul(this.seed, 0x85ebca6b)) >>> 0);
    const p = this.profile();
    this.stats.calls++;
    const entry: SimCallLog = { call: n, outcome: "pending", tokens: 0 };
    this.log.push(entry);
    if (this.log.length > 2000) this.log.shift();

    const failure = rng.next() < p.failRate ? weighted(rng, p.mix) : null;
    const ttfb = p.zeroLatency ? 0 : lognormal(rng, p.ttfbMedianMs, p.ttfbSigma) + (rng.next() < p.tail.p ? pareto(rng, p.tail.scaleMs, p.tail.alpha) - p.tail.scaleMs : 0);
    const fail = (e: UpstreamError) => {
      this.stats.failed++;
      entry.outcome = "failed";
      entry.failure = e.short;
      return e;
    };

    if (failure === "error500" || failure === "rate429" || failure === "overloaded529") {
      const delay = p.zeroLatency ? 0 : failure === "rate429" ? Math.min(40, ttfb * 0.1) : ttfb * (failure === "error500" ? 0.4 : 0.3);
      if (delay > 0) await this.wait(delay, call.signal, entry);
      if (failure === "error500") throw fail(new UpstreamError("http", 500, "api_error", "Internal server error"));
      if (failure === "rate429") throw fail(new UpstreamError("http", 429, "rate_limit_error", "Number of requests has exceeded your rate limit", p.retryAfterMs ?? 1000));
      throw fail(new UpstreamError("http", 529, "overloaded_error", "Overloaded"));
    }

    const capability = this.info ? tierRank(this.info.tier) : 2;
    const answer = think({ system: call.system, messages: call.messages, capability, rng });
    let tokens = simTokens(answer.text);
    let reason = "end_turn";
    if (tokens.length > call.maxTokens) {
      tokens = tokens.slice(0, call.maxTokens);
      reason = "max_tokens";
    }
    const inputTokens = estimateMessages(call.system, call.messages);
    const dropAt = failure === "drop" ? (rng.next() < 0.3 ? 0 : 1 + Math.floor(rng.next() * Math.max(1, tokens.length - 1))) : -1;
    return this.stream(call.signal, rng, p, ttfb, tokens, reason, inputTokens, failure === "stall", dropAt, entry, fail);
  }

  private async wait(ms: number, signal: AbortSignalLike, entry: SimCallLog): Promise<void> {
    try {
      await sleep(this.clock, ms, signal);
    } catch (e) {
      this.cancelled(entry);
      throw e;
    }
  }

  private cancelled(entry: SimCallLog): void {
    if (entry.outcome !== "pending") return;
    entry.outcome = "cancelled";
    this.stats.cancelled++;
  }

  private async *stream(
    signal: AbortSignalLike,
    rng: Rng,
    p: SimProfile,
    ttfb: number,
    tokens: string[],
    reason: string,
    inputTokens: number,
    stall: boolean,
    dropAt: number,
    entry: SimCallLog,
    fail: (e: UpstreamError) => UpstreamError,
  ): AsyncGenerator<StreamEvent> {
    try {
      if (ttfb > 0) await this.wait(ttfb, signal, entry);
      if (stall) {
        // Accepted, then nothing: only a timeout (or the caller giving up) ends this.
        await this.wait(1e9, signal, entry);
      }
      if (dropAt === 0) throw fail(new UpstreamError("dropped", 0, "api_error", "connection reset before the first token"));
      yield { type: "start", model: this.model, inputTokens };
      let i = 0;
      while (i < tokens.length) {
        if (signal.aborted) {
          this.cancelled(entry);
          return;
        }
        const n = Math.min(tokens.length - i, 1 + Math.floor(rng.next() * 3));
        if (dropAt > 0 && i + n > dropAt) throw fail(new UpstreamError("dropped", 0, "api_error", `connection reset after ${i} tokens`));
        if (i > 0 && !p.zeroLatency) await this.wait(((n * 1000) / p.tokensPerSec) * (0.7 + 0.6 * rng.next()), signal, entry);
        const text = tokens.slice(i, i + n).join("");
        i += n;
        entry.tokens = i;
        this.stats.tokens += n;
        yield { type: "text", text };
      }
      entry.outcome = "completed";
      this.stats.completed++;
      yield { type: "stop", reason, outputTokens: tokens.length };
    } finally {
      // return() from the consumer lands here without an exception.
      if (entry.outcome === "pending") this.cancelled(entry);
    }
  }
}

/** A quick profile builder. */
export function profile(over: Partial<SimProfile> = {}): SimProfile {
  return {
    ttfbMedianMs: 350,
    ttfbSigma: 0.35,
    tail: { p: 0.03, scaleMs: 400, alpha: 1.4 },
    tokensPerSec: 160,
    failRate: 0,
    mix: DEFAULT_MIX,
    ...over,
  };
}
