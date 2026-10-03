// Resilience: per-attempt timeouts, retries with full-jitter backoff, a walk
// down the fallback chain, a circuit breaker per upstream, and hedged requests.
//
// The commit point is the first token. Until an attempt produces text, the
// client has seen nothing, so a failed or slow attempt can be retried, moved to
// another upstream or raced by a hedge without the client noticing. After the
// first token is forwarded, a failure can no longer be hidden (a restarted
// answer would differ), so the stream ends with an `error` event instead.

import { backoffCeiling, retryDelay } from "./backoff";
import type { RatioBudget } from "./bucket";
import { CircuitBreaker } from "./breaker";
import { AbortError, isAbort, sleep, type Clock, type Timer } from "./clock";
import { GatewayError, UpstreamError, statusForErrorType } from "./errors";
import { hrnow, newAbortController, type AbortControllerLike, type AbortSignalLike } from "./platform";
import type { Rng } from "./rng";
import type { SampleWindow } from "./stats";
import type { AttemptRecord, ResilienceConfig, StreamEvent, Tone, Upstream, UpstreamCall } from "./types";

/** What resilience needs from the request it serves. */
export interface AttemptSink {
  readonly signal: AbortSignalLike;
  readonly attempts: AttemptRecord[];
  decide(tone: Tone, label: string, detail?: string): void;
  onAttempt?(rec: AttemptRecord, phase: "start" | "end"): void;
  /** Microseconds spent waiting on upstreams and timers (excluded from the stage's self time). */
  waitUs: number;
}

export interface ResilienceEnv {
  clock: Clock;
  rng: Rng;
  breaker(up: Upstream): CircuitBreaker;
  ttfb(up: Upstream): SampleWindow;
  hedgeBudget: RatioBudget;
}

export interface Committed {
  upstream: Upstream;
  record: AttemptRecord;
  events: AsyncGenerator<StreamEvent>;
}

/** An upstream call minus what each attempt fills in (its model and abort signal). */
export type UpstreamBase = Omit<UpstreamCall, "signal" | "model">;

interface Ready {
  it: AsyncIterator<StreamEvent>;
  buffered: StreamEvent[];
}

interface Live {
  up: Upstream;
  rec: AttemptRecord;
  ctrl: AbortControllerLike;
  ready: Promise<Ready>;
  breaker: CircuitBreaker | null;
  cancel(why: string): void;
  detach(): void;
  /** Records the attempt's outcome once (later calls are ignored). */
  end(outcome: AttemptRecord["outcome"], error?: string): void;
}

/** Abort reasons that mean "we gave up on this attempt", as opposed to "the upstream failed". */
interface Cancel {
  cancel: string;
}

export const shortName = (u: Upstream) => `${u.region}/${u.model.replace(/^claude-/, "")}`;

function nextWithAbort<T>(it: AsyncIterator<T>, signal: AbortSignalLike): Promise<IteratorResult<T>> {
  if (signal.aborted) return Promise.reject(new AbortError(signal.reason));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new AbortError(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
    it.next().then(
      (r) => {
        signal.removeEventListener("abort", onAbort);
        resolve(r);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

function withAbort<T>(p: Promise<T>, signal: AbortSignalLike): Promise<T> {
  if (signal.aborted) return Promise.reject(new AbortError(signal.reason));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new AbortError(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

/** An abort whose reason is an UpstreamError (a timeout) is that error; any other abort is a cancellation. */
function translate(e: unknown, signal: AbortSignalLike): unknown {
  if (signal.aborted && signal.reason instanceof UpstreamError) return signal.reason;
  if (isAbort(e) && e.reason instanceof UpstreamError) return e.reason;
  return e;
}

export class Resilience {
  constructor(private readonly env: ResilienceEnv) {}

  /** Runs attempts until one produces its first token, then hands back that stream. */
  async call(sink: AttemptSink, chain: readonly Upstream[], base: UpstreamBase, cfg: ResilienceConfig): Promise<Committed> {
    const { clock } = this.env;
    if (!chain.length) throw new GatewayError(400, "invalid_request_error", "no upstream serves this tier");
    const deadline = clock.now() + cfg.deadlineMs;
    const perUpstream = new Map<string, number>();
    const errors: string[] = [];
    let pos = 0;
    let retries = 0;
    let last: Upstream | null = null;
    let lastErr: UpstreamError | null = null;
    if (cfg.hedge) this.env.hedgeBudget.deposit();

    for (let n = 0; n < cfg.maxAttempts; n++) {
      let pick = this.pick(chain, pos, perUpstream, cfg, sink, true);
      if (!pick && n === 0 && cfg.breaker) {
        // Panic mode: with every circuit in the chain open, refusing outright turns a
        // partial outage into a total one. Send the request to the first deployment anyway.
        sink.decide("warn", "all circuits open · trying anyway", `sending to ${shortName(chain[0])} without a breaker slot`);
        pick = { up: chain[0], i: 0, breaker: null };
      }
      if (!pick) break;
      pos = pick.i;
      const up = pick.up;
      perUpstream.set(up.id, (perUpstream.get(up.id) ?? 0) + 1);
      const kind = n === 0 ? "primary" : up === last ? "retry" : "fallback";
      if (kind === "fallback") sink.decide("warn", `fallback → ${shortName(up)}`, lastErr ? `after ${lastErr.short}` : undefined);
      last = up;
      const remaining = deadline - clock.now();
      const first = this.start(up, kind, n + 1, base, Math.min(cfg.firstTokenTimeoutMs, remaining), cfg, sink, pick.breaker);

      let hedgeDelay: number | null = null;
      if (cfg.hedge) {
        const w = this.env.ttfb(up);
        if (w.count >= cfg.hedge.minSamples) hedgeDelay = Math.max(cfg.hedge.floorMs, w.quantile(cfg.hedge.quantile));
      }

      const w0 = hrnow();
      try {
        const { live, ready } = await this.race(first, hedgeDelay, () => this.hedge(chain, pos, up, base, cfg, sink, remaining), sink);
        sink.waitUs += (hrnow() - w0) * 1000;
        live.rec.outcome = "won";
        const ttfb = live.rec.ttfbMs ?? 0;
        this.env.ttfb(live.up).add(ttfb);
        if (live.rec.kind === "hedge") sink.decide("ok", "hedge won", `${shortName(live.up)} first token at ${Math.round(clock.now() - first.rec.startedAt)} ms`);
        else if (n > 0) sink.decide("ok", `attempt ${n + 1} ok`, `${shortName(live.up)}, first token ${Math.round(ttfb)} ms`);
        else sink.decide("ok", `first token ${Math.round(ttfb)} ms`, shortName(live.up));
        return { upstream: live.up, record: live.rec, events: this.committed(live, ready, cfg, sink) };
      } catch (e) {
        sink.waitUs += (hrnow() - w0) * 1000;
        if (!(e instanceof UpstreamError)) throw e;
        lastErr = e;
        errors.push(e.short);
        if (!e.retryable) throw new GatewayError(e.status || 502, e.errorType, e.message);
      }

      if (n + 1 >= cfg.maxAttempts) break;
      // A different upstream next needs no backoff: the wait protects the one that failed.
      const next = this.pick(chain, pos, perUpstream, cfg, sink, false);
      if (!next) break;
      if (next.up === up) {
        const delay = retryDelay(this.env.rng, retries++, cfg.backoff.baseMs, cfg.backoff.capMs, lastErr.retryAfterMs);
        if (clock.now() + delay >= deadline) {
          sink.decide("bad", "deadline reached", `retry would wait ${Math.round(delay)} ms`);
          break;
        }
        const ceiling = backoffCeiling(retries - 1, cfg.backoff.baseMs, cfg.backoff.capMs);
        sink.decide("warn", `retry #${n + 1} in ${Math.round(delay)} ms`, `after ${lastErr.short}; jitter in [0, ${Math.round(ceiling)}] ms${lastErr.retryAfterMs ? `, retry-after ${lastErr.retryAfterMs} ms` : ""}`);
        const s0 = hrnow();
        try {
          await sleep(clock, delay, sink.signal);
        } finally {
          sink.waitUs += (hrnow() - s0) * 1000;
        }
      }
    }

    if (!lastErr) {
      sink.decide("bad", "no healthy upstream", "every circuit in the chain is open");
      throw new GatewayError(529, "overloaded_error", "no healthy upstream: every circuit breaker in the fallback chain is open");
    }
    const n = errors.length;
    const msg = `${n} attempt${n > 1 ? "s" : ""} failed (${errors.join(", ")})`;
    sink.decide("bad", "gave up", msg);
    if (lastErr.kind === "http") throw new GatewayError(lastErr.status, lastErr.errorType, msg, lastErr.retryAfterMs ? { "retry-after": String(Math.ceil(lastErr.retryAfterMs / 1000)) } : {});
    throw new GatewayError(lastErr.kind === "timeout" || lastErr.kind === "stalled" ? 504 : 502, "api_error", msg);
  }

  /** The next usable deployment at or after `from`. With `take`, it also claims the breaker slot. */
  private pick(chain: readonly Upstream[], from: number, used: Map<string, number>, cfg: ResilienceConfig, sink: AttemptSink, take: boolean): { up: Upstream; i: number; breaker: CircuitBreaker | null } | null {
    const now = this.env.clock.now();
    for (let i = from; i < chain.length; i++) {
      if (!cfg.fallback && i > 0) break;
      const up = chain[i];
      if (cfg.fallback && (used.get(up.id) ?? 0) >= cfg.attemptsPerUpstream) continue;
      if (cfg.breaker) {
        const b = this.env.breaker(up);
        if (!(take ? b.acquire(now) : b.allow(now))) {
          if (take) sink.decide("warn", `breaker open · skip ${shortName(up)}`, b.state === "half-open" ? "probe in flight" : `reopens in ${Math.max(0, Math.round(b.retryAt() - now))} ms`);
          continue;
        }
        return { up, i, breaker: b };
      }
      return { up, i, breaker: null };
    }
    return null;
  }

  private hedge(chain: readonly Upstream[], pos: number, primary: Upstream, base: UpstreamBase, cfg: ResilienceConfig, sink: AttemptSink, remaining: number): Live | null {
    if (!this.env.hedgeBudget.trySpend()) {
      sink.decide("info", "hedge skipped", "hedge budget spent");
      return null;
    }
    const now = this.env.clock.now();
    // Prefer a different deployment: a hedge to the same slow replica often meets the same slowness.
    const order = cfg.fallback ? [...chain.slice(pos + 1), primary] : [primary];
    for (const up of order) {
      const b = cfg.breaker ? this.env.breaker(up) : null;
      if (b && !b.acquire(now)) continue;
      const elapsed = now - sink.attempts[sink.attempts.length - 1].startedAt;
      sink.decide("info", `hedge → ${shortName(up)}`, `primary had no first token after ${Math.round(elapsed)} ms (p${Math.round(cfg.hedge!.quantile * 100)})`);
      return this.start(up, "hedge", sink.attempts.length + 1, base, Math.max(1, Math.min(cfg.firstTokenTimeoutMs, remaining - elapsed)), cfg, sink, b);
    }
    return null;
  }

  private start(up: Upstream, kind: AttemptRecord["kind"], n: number, base: UpstreamBase, timeoutMs: number, _cfg: ResilienceConfig, sink: AttemptSink, breaker: CircuitBreaker | null): Live {
    const { clock } = this.env;
    const ctrl = newAbortController();
    const onClient = () => ctrl.abort({ cancel: "client" } satisfies Cancel);
    sink.signal.addEventListener("abort", onClient, { once: true });
    const rec: AttemptRecord = { n, upstream: up.id, kind, startedAt: clock.now() };
    sink.attempts.push(rec);
    sink.onAttempt?.(rec, "start");
    const timer: Timer = clock.setTimer(() => ctrl.abort(new UpstreamError("timeout", 0, "timeout_error", `no first token within ${Math.round(timeoutMs)} ms`)), timeoutMs);
    let ended = false;
    const end = (outcome: AttemptRecord["outcome"], error?: string) => {
      if (ended) return;
      ended = true;
      rec.outcome ??= outcome;
      if (error) rec.error = error;
      rec.endedAt = clock.now();
      sink.onAttempt?.(rec, "end");
    };

    const ready = (async (): Promise<Ready> => {
      try {
        // The upstream's own synchronous work (the simulator composing its answer, a request
        // being serialised) is upstream time, not gateway time.
        const o0 = hrnow();
        const opening = up.open({ ...base, model: up.model, signal: ctrl.signal });
        sink.waitUs += (hrnow() - o0) * 1000;
        const iterable = await withAbort(opening, ctrl.signal);
        const it = iterable[Symbol.asyncIterator]();
        const buffered: StreamEvent[] = [];
        for (;;) {
          const r = await nextWithAbort(it, ctrl.signal);
          if (r.done) throw new UpstreamError("dropped", 0, "api_error", "stream ended before the first token");
          const ev = r.value;
          if (ev.type === "error") throw new UpstreamError("http", statusForErrorType(ev.error.type), ev.error.type, ev.error.message);
          buffered.push(ev);
          if (ev.type === "start") rec.inputTokens = ev.inputTokens;
          if (ev.type === "text" || ev.type === "stop") break;
        }
        rec.ttfbMs = clock.now() - rec.startedAt;
        // The breaker's verdict is taken at the first token, not at the end of the stream:
        // failures arrive in milliseconds and full answers in seconds, so waiting for the
        // end would fill the window with failures first and trip it on a healthy upstream.
        breaker?.success(clock.now());
        return { it, buffered };
      } catch (e) {
        const err = translate(e, ctrl.signal);
        if (err instanceof UpstreamError) {
          // A 429 means "over quota, wait", not "unhealthy": retry-after handles it, the breaker does not count it.
          if (err.status === 429) breaker?.release();
          else breaker?.failure(clock.now());
          sink.decide("bad", `${shortName(up)} · ${err.short}`, err.message);
          end("failed", err.short);
        } else {
          breaker?.release();
          end("cancelled", typeof (ctrl.signal.reason as Cancel)?.cancel === "string" ? (ctrl.signal.reason as Cancel).cancel : undefined);
        }
        throw err;
      } finally {
        timer.cancel();
      }
    })();

    return {
      up,
      rec,
      ctrl,
      ready,
      breaker,
      cancel: (why) => {
        if (!ctrl.signal.aborted) ctrl.abort({ cancel: why } satisfies Cancel);
      },
      detach: () => sink.signal.removeEventListener("abort", onClient),
      end,
    };
  }

  private race(first: Live, hedgeDelay: number | null, hedgeFn: () => Live | null, sink: AttemptSink): Promise<{ live: Live; ready: Ready }> {
    const { clock } = this.env;
    return new Promise((resolve, reject) => {
      const lives: Live[] = [];
      let settled = false;
      let pending = 0;
      let hedgeTimer: Timer | null = null;
      const settle = () => {
        settled = true;
        hedgeTimer?.cancel();
      };
      const watch = (l: Live) => {
        lives.push(l);
        pending++;
        l.ready.then(
          (ready) => {
            if (settled) {
              // Reached its first token just after another attempt won: cancel it.
              l.cancel("lost the race");
              l.end("cancelled", "lost the race");
              l.detach();
              void ready.it.return?.()?.catch?.(() => {});
              return;
            }
            settle();
            for (const o of lives) if (o !== l) o.cancel(l.rec.kind === "hedge" ? "lost to the hedge" : "lost the race");
            if (lives.length > 1 && l.rec.kind !== "hedge") sink.decide("info", "primary won", "hedge cancelled");
            resolve({ live: l, ready });
          },
          (err) => {
            pending--;
            l.detach();
            if (settled) return;
            if (pending === 0) {
              settle();
              reject(err);
            }
          },
        );
      };
      watch(first);
      if (hedgeDelay !== null) {
        hedgeTimer = clock.setTimer(() => {
          hedgeTimer = null;
          if (settled) return;
          const h = hedgeFn();
          if (h) watch(h);
        }, hedgeDelay);
      }
    });
  }

  private async *committed(live: Live, ready: Ready, cfg: ResilienceConfig, sink: AttemptSink): AsyncGenerator<StreamEvent> {
    const { clock } = this.env;
    const end = live.end;
    const signal = live.ctrl.signal;
    let finished = false;
    let failed = false;
    // One watchdog per stream rather than a timer per chunk: it wakes when the idle
    // limit could have passed and re-arms itself if data arrived in the meantime.
    let last = clock.now();
    let watchdog: Timer | null = null;
    const check = () => {
      const quiet = clock.now() - last;
      if (quiet >= cfg.idleTimeoutMs) live.ctrl.abort(new UpstreamError("stalled", 0, "timeout_error", `no data for ${cfg.idleTimeoutMs} ms`));
      else watchdog = clock.setTimer(check, cfg.idleTimeoutMs - quiet);
    };
    // One abort listener per stream, raced against each read.
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(new AbortError(signal.reason));
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
    aborted.catch(() => {});
    try {
      for (const ev of ready.buffered) {
        yield ev;
        if (ev.type === "stop") finished = true;
      }
      if (!finished) watchdog = clock.setTimer(check, cfg.idleTimeoutMs);
      while (!finished) {
        const w0 = hrnow();
        let r: IteratorResult<StreamEvent>;
        try {
          if (signal.aborted) throw new AbortError(signal.reason);
          r = await Promise.race([ready.it.next(), aborted]);
        } finally {
          sink.waitUs += (hrnow() - w0) * 1000;
        }
        last = clock.now();
        // An upstream that stops because we aborted it is a cancellation, not a drop.
        if (signal.aborted) throw new AbortError(signal.reason);
        if (r.done) throw new UpstreamError("dropped", 0, "api_error", "stream ended without a stop event");
        const ev = r.value;
        if (ev.type === "error") throw new UpstreamError("http", statusForErrorType(ev.error.type), ev.error.type, ev.error.message);
        yield ev;
        if (ev.type === "stop") finished = true;
      }
      end("won");
    } catch (e) {
      const err = translate(e, signal);
      if (!(err instanceof UpstreamError)) throw err;
      failed = true;
      live.breaker?.failure(clock.now());
      sink.decide("bad", `stream ${err.kind} mid-flight`, `${shortName(live.up)}: ${err.message}. Tokens already reached the client, so this cannot be retried.`);
      end("won", `${err.short} after first token`);
      yield { type: "error", error: { type: err.kind === "http" ? err.errorType : "api_error", message: `upstream ${err.kind === "http" ? err.errorType : err.kind} after the response started: ${err.message}` } };
    } finally {
      (watchdog as Timer | null)?.cancel();
      signal.removeEventListener("abort", onAbort);
      live.detach();
      if (!finished && !failed) end("won", "stopped early");
      if (!finished) live.cancel("stream closed");
      void ready.it.return?.()?.catch?.(() => {});
    }
  }
}
