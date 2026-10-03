import { AuditLog, type AuditRecord } from "./audit";
import { CircuitBreaker, type BreakerState, type BreakerTransition } from "./breaker";
import { RatioBudget, TokenBucket } from "./bucket";
import { ResponseCache } from "./cache";
import type { CanaryController } from "./canary";
import { isAbort, systemClock, type Clock } from "./clock";
import type { Middleware, Next, Outcome, Reply, RequestContext, RequestSummary } from "./context";
import { GatewayError } from "./errors";
import { Registry } from "./metrics";
import { createChain, type GatewayInternals, type TenantState } from "./middleware";
import { hrnow, newAbortController, type AbortSignalLike } from "./platform";
import { redact, Vault } from "./redact";
import { Resilience } from "./resilience";
import { mathRandom, type Rng } from "./rng";
import { CATALOG } from "./routing";
import { sha256 } from "./sha256";
import { SampleWindow } from "./stats";
import { STAGES, type ApiError, type AttemptRecord, type BreakerConfig, type Decision, type GatewayConfig, type ModelInfo, type RelayRequest, type Stage, type StreamEvent, type TenantConfig, type Tone, type Upstream } from "./types";

export type GatewayEvent =
  | { type: "request"; id: string; at: number; tenant: string | null; configVersion: string; canary: boolean }
  | { type: "decision"; id: string; decision: Decision }
  | { type: "attempt"; id: string; phase: "start" | "end"; attempt: AttemptRecord }
  | { type: "breaker"; upstream: string; transition: BreakerTransition }
  | { type: "done"; summary: RequestSummary };

export interface RelayResponse {
  id: string;
  status: number;
  headers: Record<string, string>;
  /** Present when status is 200. Iterate it to completion (or stop early to cancel). */
  events?: AsyncGenerator<StreamEvent>;
  error?: ApiError;
  /** Resolves once the request has fully ended and been audited. */
  done: Promise<RequestSummary>;
  ctx: RequestContext;
}

export interface GatewayOptions {
  tenants: TenantConfig[];
  upstreams: Upstream[];
  configs: GatewayConfig[];
  stable: string;
  catalog?: readonly ModelInfo[];
  clock?: Clock;
  rng?: Rng;
  /** Wall-clock time for audit timestamps. */
  wallNow?: () => number;
  breaker?: BreakerConfig;
  cacheCapacity?: number;
  auditCapacity?: number;
  onEvent?: (e: GatewayEvent) => void;
  canary?: CanaryController;
  idPrefix?: string;
  /** Hedges allowed per request, on average (0.1 = at most one extra call per ten requests). */
  hedgeRatio?: number;
}

/** Hedges allowed per request on average, with a burst of ten. */
export const DEFAULT_HEDGE_RATIO = 0.1;

export const DEFAULT_BREAKER: BreakerConfig = { window: 20, minRequests: 8, failureRate: 0.5, cooldownMs: 4000, maxCooldownMs: 30000, probes: 2 };

const LATENCY_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32];
const STAGE_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 5000];

export class Gateway {
  readonly clock: Clock;
  readonly rng: Rng;
  readonly catalog: readonly ModelInfo[];
  readonly cache: ResponseCache;
  readonly audit: AuditLog;
  readonly metrics = new Registry();
  readonly breakers = new Map<string, CircuitBreaker>();
  readonly configs = new Map<string, GatewayConfig>();
  stable: string;
  canary: CanaryController | null;
  onEvent: ((e: GatewayEvent) => void) | null;

  private upstreams: Upstream[];
  private tenants: TenantConfig[];
  private keyIndex = new Map<string, TenantConfig>();
  private state = new Map<string, TenantState>();
  private ttfb = new Map<string, SampleWindow>();
  private hedgeBudget: RatioBudget;
  private resilience: Resilience;
  private chain: Next;
  private seq = 0;
  private readonly wallNow: () => number;
  private readonly breakerCfg: BreakerConfig;
  private readonly idPrefix: string;

  private m = {
    requests: this.metrics.counter("relay_requests_total", "Requests by tenant, status and cache result"),
    latency: this.metrics.histogram("relay_request_duration_seconds", "End-to-end request time, until the last event", LATENCY_BUCKETS),
    ttfb: this.metrics.histogram("relay_time_to_first_token_seconds", "Time until the first text reached the client", LATENCY_BUCKETS),
    stage: this.metrics.histogram("relay_stage_self_microseconds", "CPU time per middleware stage, excluding waits", STAGE_BUCKETS),
    attempts: this.metrics.counter("relay_upstream_attempts_total", "Upstream attempts by upstream, kind and outcome"),
    tokens: this.metrics.counter("relay_tokens_total", "Tokens by tenant and direction"),
    cost: this.metrics.counter("relay_cost_usd_total", "Metered spend by tenant"),
    saved: this.metrics.counter("relay_cache_saved_usd_total", "Spend avoided by cache hits, by tenant"),
    redactions: this.metrics.counter("relay_redactions_total", "PII values replaced, by type"),
    screened: this.metrics.counter("relay_screen_verdicts_total", "Prompt-injection screen verdicts"),
    breaker: this.metrics.gauge("relay_circuit_state", "Circuit state per upstream: 0 closed, 1 half-open, 2 open"),
    budget: this.metrics.gauge("relay_budget_remaining_usd", "Budget left in the current window, by tenant"),
    cuts: this.metrics.counter("relay_stream_cuts_total", "Streams ended early by the gateway, by reason"),
  };

  constructor(opts: GatewayOptions) {
    this.clock = opts.clock ?? systemClock;
    this.rng = opts.rng ?? mathRandom;
    this.catalog = opts.catalog ?? CATALOG;
    this.cache = new ResponseCache(opts.cacheCapacity ?? 5000);
    this.audit = new AuditLog(opts.auditCapacity ?? 1000);
    this.wallNow = opts.wallNow ?? (() => Date.now());
    this.breakerCfg = opts.breaker ?? DEFAULT_BREAKER;
    this.onEvent = opts.onEvent ?? null;
    this.canary = opts.canary ?? null;
    this.idPrefix = opts.idPrefix ?? "msg_relay_";
    this.upstreams = opts.upstreams;
    this.tenants = opts.tenants;
    for (const c of opts.configs) this.configs.set(c.version, c);
    if (!this.configs.has(opts.stable)) throw new Error(`unknown stable config ${opts.stable}`);
    this.stable = opts.stable;
    this.indexKeys();
    this.hedgeBudget = new RatioBudget(opts.hedgeRatio ?? DEFAULT_HEDGE_RATIO, 10);
    this.resilience = new Resilience({
      clock: this.clock,
      rng: this.rng,
      breaker: (u) => this.breakerFor(u.id),
      ttfb: (u) => {
        let w = this.ttfb.get(u.id);
        if (!w) this.ttfb.set(u.id, (w = new SampleWindow(256, 8)));
        return w;
      },
      hedgeBudget: this.hedgeBudget,
    });
    const internals: GatewayInternals = {
      clock: this.clock,
      catalog: this.catalog,
      upstreams: () => this.upstreams,
      cache: this.cache,
      resilience: this.resilience,
      tenantByKey: (k) => this.keyIndex.get(sha256(k)) ?? null,
      tenantState: (t) => this.tenantState(t),
      budgetWindow: (t, st) => this.rollBudget(t, st),
      onAttempt: (ctx, rec, phase) => {
        if (phase === "end") this.m.attempts.inc({ upstream: rec.upstream, kind: rec.kind, outcome: rec.outcome ?? "failed" });
        this.emit({ type: "attempt", id: ctx.id, phase, attempt: { ...rec } });
      },
    };
    this.chain = compose(createChain(internals));
    for (const u of this.upstreams) this.breakerFor(u.id);
  }

  // ---------------------------------------------------------------- configuration

  setUpstreams(upstreams: Upstream[]): void {
    this.upstreams = upstreams;
    for (const u of upstreams) this.breakerFor(u.id);
  }

  getUpstreams(): readonly Upstream[] {
    return this.upstreams;
  }

  setTenants(tenants: TenantConfig[]): void {
    this.tenants = tenants;
    this.indexKeys();
  }

  getTenants(): readonly TenantConfig[] {
    return this.tenants;
  }

  addConfig(c: GatewayConfig): void {
    this.configs.set(c.version, c);
  }

  /** Spend in the current budget window, per tenant. */
  spend(tenantId: string): { spentUsd: number; budgetUsd: number; windowEndsAt: number } | null {
    const t = this.tenants.find((x) => x.id === tenantId);
    if (!t) return null;
    const st = this.tenantState(t);
    this.rollBudget(t, st);
    return { spentUsd: st.spentUsd, budgetUsd: t.budgetUsd, windowEndsAt: st.windowStart + t.budgetWindowMs };
  }

  breakerStates(): { upstream: string; state: BreakerState; failureRate: number; trips: number }[] {
    return [...this.breakers.values()].map((b) => ({ upstream: b.id, state: b.state, failureRate: b.failureRate, trips: b.trips }));
  }

  ttfbQuantile(upstream: string, q: number): number | null {
    const w = this.ttfb.get(upstream);
    return w && w.count ? w.quantile(q) : null;
  }

  renderMetrics(): string {
    const now = this.clock.now();
    for (const b of this.breakers.values()) {
      b.allow(now);
      this.m.breaker.set({ upstream: b.id }, b.state === "closed" ? 0 : b.state === "half-open" ? 1 : 2);
    }
    for (const t of this.tenants) {
      const s = this.spend(t.id)!;
      this.m.budget.set({ tenant: t.id }, Math.max(0, s.budgetUsd - s.spentUsd));
    }
    return this.metrics.render();
  }

  // ---------------------------------------------------------------- the request path

  /**
   * `tap` sees every event as the source produced it (the upstream's or the
   * cache's stream, placeholders and chunk boundaries intact), before any stream
   * hook runs. The playground uses it to show what the model actually sent.
   */
  async handle(req: RelayRequest, opts: { signal?: AbortSignalLike; tap?: (ev: StreamEvent, source: Stage) => void } = {}): Promise<RelayResponse> {
    const id = req.id ?? `${this.idPrefix}${(++this.seq).toString(36).padStart(6, "0")}`;
    const start = hrnow();
    const ctrl = newAbortController();
    if (opts.signal) {
      if (opts.signal.aborted) ctrl.abort(opts.signal.reason);
      else opts.signal.addEventListener("abort", () => ctrl.abort(opts.signal!.reason), { once: true });
    }
    let version = req.configVersion ?? this.stable;
    let canary = false;
    if (!req.configVersion && this.canary) {
      version = this.canary.route(id);
      canary = version !== this.stable;
    }
    const config = this.configs.get(version) ?? this.configs.get(this.stable)!;
    const ctx = this.newContext(id, req, config, canary, ctrl.signal);
    this.emit({ type: "request", id, at: ctx.startedAt, tenant: null, configVersion: config.version, canary });

    let resolveDone!: (s: RequestSummary) => void;
    const done = new Promise<RequestSummary>((r) => (resolveDone = r));
    try {
      const reply = await this.chain(ctx);
      ctx.headers["x-relay-request-id"] = id;
      ctx.headers["x-relay-config"] = config.version;
      return { id, status: 200, headers: ctx.headers, events: this.pump(ctx, reply, start, resolveDone, opts.tap), done, ctx };
    } catch (e) {
      const err = e instanceof GatewayError ? e : isAbort(e) ? new GatewayError(499, "request_cancelled", "client closed the request") : new GatewayError(500, "api_error", e instanceof Error ? e.message : String(e));
      // Turned away before any upstream was tried (auth, limits, screen, budget) is "rejected";
      // anything that failed upstream is an "error".
      const outcome: Outcome = err.status === 499 ? "cancelled" : ctx.attempts.length || err.status >= 500 ? "error" : "rejected";
      resolveDone(this.finish(ctx, outcome, err.status, start, err.message));
      return { id, status: err.status, headers: { ...ctx.headers, ...err.headers, "x-relay-request-id": id }, error: { type: err.type, message: err.message }, done, ctx };
    }
  }

  private newContext(id: string, req: RelayRequest, config: GatewayConfig, canary: boolean, signal: AbortSignalLike): RequestContext {
    const startedAt = this.clock.now();
    const us = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
    const ctx: RequestContext = {
      id,
      req,
      config,
      canary,
      startedAt,
      signal,
      tenant: null,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      system: req.system,
      vault: new Vault(),
      redaction: {},
      auditPrompt: "",
      upstreamText: "",
      screen: null,
      flagged: false,
      cache: { kind: "bypass" },
      route: null,
      attempts: [],
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, wastedUsd: 0, estimated: false },
      cut: null,
      headers: {},
      hooks: [],
      decisions: [],
      us,
      waitUs: 0,
      firstTextAt: null,
      decide: (stage: Stage, tone: Tone, label: string, detail?: string) => {
        const d: Decision = { stage, tone, label, detail, at: this.clock.now() - startedAt };
        ctx.decisions.push(d);
        this.emit({ type: "decision", id, decision: d });
      },
    };
    return ctx;
  }

  /** Runs the response through every registered stream hook, innermost first, timing each. */
  private async *pump(ctx: RequestContext, reply: Reply, start: number, resolveDone: (s: RequestSummary) => void, tap?: (ev: StreamEvent, source: Stage) => void): AsyncGenerator<StreamEvent> {
    const hooks = ctx.hooks.filter((h) => h.event).reverse();
    let outcome: Outcome = "cancelled";
    let terminal = false;
    try {
      while (!terminal) {
        const t0 = hrnow();
        const w0 = ctx.waitUs;
        let r: IteratorResult<StreamEvent>;
        try {
          r = await reply.source.next();
        } finally {
          ctx.us[reply.sourceStage] += (hrnow() - t0) * 1000 - (ctx.waitUs - w0);
        }
        if (tap && !r.done) tap(r.value, reply.sourceStage);
        let batch: StreamEvent[] = r.done ? [{ type: "error", error: { type: "api_error", message: "stream ended without a stop event" } }] : [r.value];
        for (const h of hooks) {
          const t = hrnow();
          if (batch.length === 1) {
            // The common case: one event in, passed through or replaced, no new array.
            const x = h.event!(batch[0], ctx);
            if (x !== undefined) batch = x;
          } else {
            const out: StreamEvent[] = [];
            for (const ev of batch) {
              const x = h.event!(ev, ctx);
              if (x === undefined) out.push(ev);
              else for (const y of x) out.push(y);
            }
            batch = out;
          }
          ctx.us[h.stage] += (hrnow() - t) * 1000;
        }
        for (const ev of batch) {
          if (ev.type === "text" && ctx.firstTextAt === null) ctx.firstTextAt = this.clock.now();
          if (ev.type === "stop" || ev.type === "error") {
            terminal = true;
            outcome = ctx.cut ? "cut" : ev.type === "stop" ? "ok" : "error";
          }
          yield ev;
          if (terminal) break;
        }
      }
    } catch (e) {
      if (!isAbort(e)) {
        outcome = "error";
        terminal = true;
        yield { type: "error", error: { type: "api_error", message: e instanceof Error ? e.message : String(e) } };
      }
    } finally {
      await reply.source.return(undefined).catch(() => {});
      resolveDone(this.finish(ctx, outcome, outcome === "cancelled" ? 499 : 200, start));
    }
  }

  private finish(ctx: RequestContext, outcome: Outcome, status: number, start: number, error?: string): RequestSummary {
    for (const h of [...ctx.hooks].reverse()) {
      if (!h.end) continue;
      const t = hrnow();
      h.end(ctx, outcome);
      ctx.us[h.stage] += (hrnow() - t) * 1000;
    }
    if (ctx.cut) this.m.cuts.inc({ reason: ctx.cut });
    const t = hrnow();
    const record = this.writeAudit(ctx, outcome, status, error);
    ctx.us.audit += (hrnow() - t) * 1000;

    const now = this.clock.now();
    const totalUs = (hrnow() - start) * 1000;
    const summary: RequestSummary = {
      id: ctx.id,
      tenant: ctx.tenant?.id ?? null,
      configVersion: ctx.config.version,
      canary: ctx.canary,
      model: ctx.req.model,
      status,
      outcome,
      error,
      cache: ctx.cache.kind,
      similarity: ctx.cache.similarity,
      tier: ctx.route?.tier,
      upstream: ctx.route?.upstream,
      servedModel: ctx.usage.model,
      attempts: ctx.attempts.length,
      retries: ctx.attempts.filter((a) => a.kind === "retry" || a.kind === "fallback").length,
      hedged: ctx.attempts.some((a) => a.kind === "hedge"),
      hedgeWon: ctx.attempts.some((a) => a.kind === "hedge" && a.outcome === "won"),
      fellBack: ctx.attempts.some((a) => a.kind === "fallback"),
      latencyMs: now - ctx.startedAt,
      ttfbMs: ctx.firstTextAt === null ? null : ctx.firstTextAt - ctx.startedAt,
      inputTokens: ctx.usage.inputTokens,
      outputTokens: ctx.usage.outputTokens,
      costUsd: ctx.usage.costUsd,
      savedUsd: ctx.cache.savedUsd ?? 0,
      wastedUsd: ctx.usage.wastedUsd,
      redactions: Object.values(ctx.redaction).reduce((a, b) => a + (b ?? 0), 0),
      screenScore: ctx.screen?.score ?? null,
      verdict: ctx.screen?.verdict ?? null,
      trace: { stages: { ...ctx.us }, upstreamUs: ctx.waitUs, totalUs },
      decisions: ctx.decisions,
      startedAt: ctx.startedAt,
      endedAt: now,
    };
    void record;
    this.record(summary, ctx);
    this.canary?.observe(summary);
    this.emit({ type: "done", summary });
    return summary;
  }

  private writeAudit(ctx: RequestContext, outcome: Outcome, status: number, error?: string): AuditRecord {
    // The response is stored as the upstream produced it (placeholders). With redaction
    // off, it is redacted one-way here so the log never holds raw PII.
    const response = ctx.tenant?.redaction === "off" ? redact(ctx.upstreamText, new Vault(), "mask").text : ctx.upstreamText;
    const prompt = ctx.auditPrompt || (ctx.tenant ? "" : redact([...ctx.req.messages].reverse().find((m) => m.role === "user")?.content ?? "", new Vault(), "mask").text);
    return this.audit.append({
      id: ctx.id,
      time: new Date(this.wallNow()).toISOString(),
      tenant: ctx.tenant?.id ?? null,
      configVersion: ctx.config.version,
      model: ctx.req.model,
      route: ctx.route ? { tier: ctx.route.tier, upstream: ctx.route.upstream ?? null, model: ctx.route.model ?? null } : null,
      status,
      outcome,
      error,
      redaction: ctx.redaction,
      screen: ctx.screen ? { score: ctx.screen.score, verdict: ctx.screen.verdict, signals: ctx.screen.signals.map((s) => s.id) } : null,
      cache: ctx.cache.kind,
      attempts: ctx.attempts.map((a) => ({ upstream: a.upstream, kind: a.kind, outcome: a.outcome, error: a.error, ttfbMs: a.ttfbMs === undefined ? undefined : Math.round(a.ttfbMs) })),
      usage: {
        inputTokens: ctx.usage.inputTokens,
        outputTokens: ctx.usage.outputTokens,
        costUsd: Math.round(ctx.usage.costUsd * 1e8) / 1e8,
        wastedUsd: Math.round(ctx.usage.wastedUsd * 1e8) / 1e8,
        estimated: ctx.usage.estimated,
      },
      latencyMs: Math.round(this.clock.now() - ctx.startedAt),
      ttfbMs: ctx.firstTextAt === null ? null : Math.round(ctx.firstTextAt - ctx.startedAt),
      prompt,
      response,
    });
  }

  private record(s: RequestSummary, ctx: RequestContext): void {
    const tenant = s.tenant ?? "unknown";
    this.m.requests.inc({ tenant, status: String(s.status), cache: s.cache });
    this.m.latency.observe({ tenant }, s.latencyMs / 1000);
    if (s.ttfbMs !== null) this.m.ttfb.observe({ tenant }, s.ttfbMs / 1000);
    for (const st of STAGES) if (s.trace.stages[st] > 0) this.m.stage.observe({ stage: st }, s.trace.stages[st]);
    if (s.inputTokens) this.m.tokens.inc({ tenant, direction: "input" }, s.inputTokens);
    if (s.outputTokens) this.m.tokens.inc({ tenant, direction: "output" }, s.outputTokens);
    if (s.costUsd) this.m.cost.inc({ tenant }, s.costUsd);
    if (s.savedUsd) this.m.saved.inc({ tenant }, s.savedUsd);
    for (const [type, n] of Object.entries(ctx.redaction)) if (n) this.m.redactions.inc({ type }, n);
    if (s.verdict) this.m.screened.inc({ verdict: s.verdict });
  }

  // ---------------------------------------------------------------- internals

  private emit(e: GatewayEvent): void {
    this.onEvent?.(e);
  }

  private indexKeys(): void {
    this.keyIndex.clear();
    for (const t of this.tenants) for (const k of t.keys) this.keyIndex.set(sha256(k), t);
  }

  private tenantState(t: TenantConfig): TenantState {
    let st = this.state.get(t.id);
    const now = this.clock.now();
    if (!st || st.rpm.capacity !== t.limits.requestsPerMinute || st.tpm.capacity !== t.limits.tokensPerMinute) {
      st = {
        rpm: new TokenBucket(t.limits.requestsPerMinute, 60_000, now),
        tpm: new TokenBucket(t.limits.tokensPerMinute, 60_000, now),
        windowStart: st?.windowStart ?? Math.floor(now / t.budgetWindowMs) * t.budgetWindowMs,
        spentUsd: st?.spentUsd ?? 0,
      };
      this.state.set(t.id, st);
    }
    return st;
  }

  private rollBudget(t: TenantConfig, st: TenantState): void {
    const now = this.clock.now();
    if (now >= st.windowStart + t.budgetWindowMs) {
      st.windowStart = Math.floor(now / t.budgetWindowMs) * t.budgetWindowMs;
      st.spentUsd = 0;
    }
  }

  private breakerFor(id: string): CircuitBreaker {
    let b = this.breakers.get(id);
    if (!b) {
      b = new CircuitBreaker(id, this.breakerCfg, (transition) => {
        this.m.breaker.set({ upstream: id }, transition.to === "closed" ? 0 : transition.to === "half-open" ? 1 : 2);
        this.emit({ type: "breaker", upstream: id, transition });
      });
      this.breakers.set(id, b);
    }
    return b;
  }
}

/** Nests the middleware and measures each one's self time: its own time minus the stages inside it and minus waits. */
export function compose(mws: readonly Middleware[]): Next {
  const terminal: Next = () => Promise.reject(new GatewayError(500, "api_error", "the chain ended without a reply"));
  return mws.reduceRight<Next>(
    (next, mw) => async (ctx) => {
      let inner = 0;
      let innerWait = 0;
      const timedNext: Next = async (c) => {
        const a = hrnow();
        const w = c.waitUs;
        try {
          return await next(c);
        } finally {
          inner += (hrnow() - a) * 1000;
          innerWait += c.waitUs - w;
        }
      };
      const t0 = hrnow();
      const w0 = ctx.waitUs;
      try {
        return await mw.handle(ctx, timedNext);
      } finally {
        const ownWait = ctx.waitUs - w0 - innerWait;
        ctx.us[mw.stage] += (hrnow() - t0) * 1000 - inner - ownWait;
      }
    },
    terminal,
  );
}
