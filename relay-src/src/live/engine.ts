// The page's live gateway: the real @relay/core Gateway, in this tab, in front of
// simulated deployments, with synthetic traffic flowing from the moment the page
// opens. Everything the page draws comes from the gateway's own events.

import {
  CanaryController,
  CONFIGS,
  Gateway,
  isServerError,
  liveProfile,
  mathRandom,
  quantile,
  runEvalSuite,
  seeded,
  simDeployments,
  systemClock,
  TENANTS,
  traffic,
  type BreakerState,
  type CanaryState,
  type CanaryStep,
  type Decision,
  type GatewayEvent,
  type LiveKnobs,
  type RelayRequest,
  type RelayResponse,
  type RequestSummary,
  type SimUpstream,
  type Stage,
  type StreamEvent,
  type TenantConfig,
} from "@relay/core";

/** A playground-only tenant with a budget small enough to watch a stream get cut. */
export const SANDBOX: TenantConfig = {
  id: "sandbox",
  name: "Sandbox",
  keys: ["relay-demo-sandbox"],
  limits: { requestsPerMinute: 30, tokensPerMinute: 60_000 },
  budgetUsd: 0.001,
  budgetWindowMs: 60_000,
  cache: { ttlMs: 120_000, near: true, threshold: 0.6 },
  redaction: "reversible",
  screen: { flag: 0.4, block: 0.7 },
  maxTier: "best",
};

export const PLAY_TENANTS: TenantConfig[] = [...TENANTS, SANDBOX];

export interface SendOptions {
  signal?: AbortSignal;
  tap?: (ev: StreamEvent, source: Stage) => void;
}

export interface Knobs extends LiveKnobs {
  rps: number;
  running: boolean;
}

export interface Packet {
  id: string;
  t0: number;
  /** Stages that reported a decision, in order. */
  stages: Stage[];
  tone: "ok" | "info" | "warn" | "bad";
  attempts: { upstream: string; kind: string; failed: boolean; t: number }[];
  done: number | null;
  outcome: RequestSummary["outcome"] | null;
  cache: boolean;
  /** The playground's request, drawn larger. */
  mine: boolean;
}

export interface SeriesPoint {
  t: number;
  success: number | null;
  p50: number | null;
  p99: number | null;
  costPerMin: number;
  cacheHit: number | null;
  rps: number;
}

export interface StageNote {
  decision: Decision;
  at: number;
}

/** Steps sized for a demo at ~12 req/s, so a rollout takes well under a minute. The server and the benchmark use DEFAULT_STEPS (12/20/30 samples). */
export const DEMO_STEPS: CanaryStep[] = [
  { weight: 0.05, minSamples: 6, minDwellMs: 2500, maxDwellMs: 90000 },
  { weight: 0.25, minSamples: 10, minDwellMs: 2500, maxDwellMs: 90000 },
  { weight: 1, minSamples: 15, minDwellMs: 2500, maxDwellMs: 90000 },
];

type Listener = () => void;

export class LiveEngine {
  readonly gw: Gateway;
  readonly sims: SimUpstream[];
  readonly canary: CanaryController;
  knobs: Knobs = { rps: 12, failRate: 0.04, bothRegions: false, tail: 0.25, running: true };

  packets: Packet[] = [];
  recent: RequestSummary[] = [];
  notes = new Map<Stage, StageNote>();
  series: SeriesPoint[] = [];
  totals = { requests: 0, ok: 0, errors: 0, rejected: 0, cut: 0, cacheHits: 0, costUsd: 0, savedUsd: 0, retries: 0, hedges: 0, redactions: 0, blocked: 0 };
  /** Upstream attempts in flight, for the deployment boxes. */
  active = new Map<string, number>();
  flashes = new Map<string, number>();
  version = 0;

  private window: RequestSummary[] = [];
  private listeners = new Set<Listener>();
  private next: () => ReturnType<ReturnType<typeof traffic>>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private packetById = new Map<string, Packet>();
  private hidden = false;
  private mineIds = new Set<string>();
  private playSeq = 0;

  constructor() {
    const seed = (Math.random() * 2 ** 31) | 0;
    this.sims = simDeployments(systemClock, (m, r) => liveProfile(m, r, this.knobs), seed);
    this.gw = new Gateway({ tenants: PLAY_TENANTS, upstreams: this.sims, configs: CONFIGS, stable: "v1", clock: systemClock, rng: mathRandom, onEvent: (e) => this.onEvent(e), auditCapacity: 500 });
    this.canary = new CanaryController({
      clock: systemClock,
      stable: "v1",
      steps: DEMO_STEPS,
      runEvals: (v) => runEvalSuite(v),
      onChange: () => this.bump(),
      onPromote: (v) => {
        this.gw.stable = v;
      },
    });
    this.gw.canary = this.canary;
    this.next = traffic(seeded(seed ^ 0x5bd1e995), { repeat: 0.3, reword: 0.14, attack: 0.04, maxTokens: 300 });
  }

  start(): void {
    if (this.ticker) return;
    this.schedule();
    this.ticker = setInterval(() => this.tick(), 500);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.ticker) clearInterval(this.ticker);
    this.timer = null;
    this.ticker = null;
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  setKnobs(k: Partial<Knobs>): void {
    const wasRunning = this.knobs.running;
    this.knobs = { ...this.knobs, ...k };
    if (k.rps !== undefined || (this.knobs.running && !wasRunning)) this.schedule();
    this.bump();
  }

  /**
   * Sends one request through a gateway (the live one unless `gw` is given), marked
   * as the visitor's so the chain draws it larger. Another gateway's events reach
   * the chain through `external()`.
   */
  send(req: RelayRequest, opts: SendOptions = {}, gw: Gateway = this.gw): Promise<RelayResponse> {
    const id = req.id ?? `msg_play_${(++this.playSeq).toString(36).padStart(4, "0")}`;
    this.mineIds.add(id);
    return gw.handle({ ...req, id }, opts);
  }

  /** Feeds another gateway's events (the playground's real-Claude gateway) to the chain only. */
  external = (e: GatewayEvent): void => {
    this.onEvent(e, true);
  };

  breakerStates(): { upstream: string; state: BreakerState; failureRate: number; trips: number }[] {
    return this.gw.breakerStates();
  }

  canaryState(): CanaryState {
    return this.canary.state;
  }

  resetStable(): void {
    this.gw.stable = "v1";
    this.canary.reset("v1");
  }

  // ------------------------------------------------------------------ internals

  private onVisibility = () => {
    this.hidden = document.visibilityState === "hidden";
    if (!this.hidden) this.schedule();
  };

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.knobs.running || this.hidden || this.knobs.rps <= 0) return;
    const gap = -Math.log(1 - Math.random()) * (1000 / this.knobs.rps);
    this.timer = setTimeout(() => {
      this.fire();
      this.schedule();
    }, gap);
  }

  private fire(): void {
    const item = this.next();
    void (async () => {
      const res = await this.gw.handle(item.req);
      if (res.events) for await (const ev of res.events) void ev;
      await res.done;
    })();
  }

  private bump(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  private onEvent(e: GatewayEvent, external = false): void {
    const now = performance.now();
    switch (e.type) {
      case "request": {
        const p: Packet = { id: e.id, t0: now, stages: [], tone: "ok", attempts: [], done: null, outcome: null, cache: false, mine: this.mineIds.has(e.id) };
        this.packets.push(p);
        this.packetById.set(e.id, p);
        if (this.packets.length > 160) {
          const old = this.packets.shift()!;
          this.packetById.delete(old.id);
        }
        break;
      }
      case "decision": {
        const p = this.packetById.get(e.id);
        const d = e.decision;
        if (p) {
          if (p.stages[p.stages.length - 1] !== d.stage) p.stages.push(d.stage);
          if (d.tone === "bad") p.tone = "bad";
          else if (d.tone === "warn" && p.tone !== "bad") p.tone = "warn";
          if (d.stage === "cache" && /hit/.test(d.label)) p.cache = true;
        }
        // Captions prefer the interesting: a routine "ok" does not replace a recent warning.
        const prev = this.notes.get(d.stage);
        const routine = d.tone === "ok" || (d.tone === "info" && d.stage === "cache" && d.label === "miss");
        if (!prev || !routine || now - prev.at > 1800 || prev.decision.tone === "ok") this.notes.set(d.stage, { decision: d, at: now });
        break;
      }
      case "attempt": {
        const p = this.packetById.get(e.id);
        const up = e.attempt.upstream;
        if (e.phase === "start") {
          this.active.set(up, (this.active.get(up) ?? 0) + 1);
          p?.attempts.push({ upstream: up, kind: e.attempt.kind, failed: false, t: now });
        } else {
          this.active.set(up, Math.max(0, (this.active.get(up) ?? 1) - 1));
          if (e.attempt.outcome === "failed") {
            this.flashes.set(up, now);
            const a = p?.attempts.find((x) => x.upstream === up && !x.failed);
            if (a) a.failed = true;
          }
        }
        break;
      }
      case "breaker":
        this.flashes.set(e.upstream, now);
        break;
      case "done": {
        const s = e.summary;
        const p = this.packetById.get(s.id);
        if (p) {
          p.done = now;
          p.outcome = s.outcome;
        }
        this.mineIds.delete(s.id);
        if (external) break;
        const rec = this.gw.audit.list({ limit: 1 })[0];
        if (rec)
          this.notes.set("audit", {
            decision: { stage: "audit", tone: "ok", label: `#${rec.seq} appended`, detail: `sha256 ${rec.hash.slice(0, 8)}… chained to ${rec.prev.slice(0, 8)}…`, at: 0 },
            at: now,
          });
        this.window.push(s);
        this.recent.unshift(s);
        if (this.recent.length > 40) this.recent.length = 40;
        const t = this.totals;
        t.requests++;
        if (s.outcome === "ok") t.ok++;
        else if (s.outcome === "rejected") t.rejected++;
        else if (s.outcome === "cut") t.cut++;
        else if (s.outcome === "error") t.errors++;
        if (s.cache === "exact" || s.cache === "near") t.cacheHits++;
        if (s.status === 400) t.blocked++;
        t.costUsd += s.costUsd;
        t.savedUsd += s.savedUsd;
        t.retries += s.retries;
        t.redactions += s.redactions;
        if (s.hedged) t.hedges++;
        break;
      }
    }
  }

  private tick(): void {
    const now = performance.now();
    this.canary.tick();
    // Rolling 10 s window for rates and percentiles; one chart point per tick.
    const horizon = systemClock.now() - 10_000;
    this.window = this.window.filter((s) => s.endedAt >= horizon);
    const w = this.window;
    const served = w.filter((s) => s.outcome !== "rejected" && s.outcome !== "cancelled");
    const failures = served.filter((s) => isServerError(s)).length;
    const lat = w.filter((s) => s.outcome === "ok" && s.cache !== "exact" && s.cache !== "near").map((s) => s.latencyMs);
    const looked = w.filter((s) => s.cache !== "bypass" && s.status === 200);
    const hits = looked.filter((s) => s.cache === "exact" || s.cache === "near").length;
    const cost = w.reduce((a, s) => a + s.costUsd, 0);
    const span = Math.max(1, Math.min(10, (now - (this.series[0]?.t ?? now)) / 1000 + 0.5));
    this.series.push({
      t: now,
      success: served.length ? 1 - failures / served.length : null,
      p50: lat.length ? quantile(lat, 0.5) : null,
      p99: lat.length ? quantile(lat, 0.99) : null,
      costPerMin: (cost / span) * 60,
      cacheHit: looked.length ? hits / looked.length : null,
      rps: w.length / span,
    });
    if (this.series.length > 120) this.series.shift();
    this.bump();
  }
}

export const STAGE_LABEL: Record<Stage, string> = {
  auth: "Auth",
  limit: "Rate limit",
  redact: "Redact",
  screen: "Screen",
  cache: "Cache",
  route: "Route",
  resilience: "Resilience",
  meter: "Meter",
  audit: "Audit",
};
