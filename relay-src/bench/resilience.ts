// Resilience under injected failure, and hedging under a heavy-tailed upstream.
// Everything runs in virtual time on the simulator: thousands of requests with
// real timeouts, backoff sleeps and multi-second tails finish in seconds, and
// every run is reproducible from its seed.

import { CONFIGS, DEFAULT_MIX, Gateway, liveProfile, seeded, simDeployments, STANDARD_RESILIENCE, traffic, VirtualClock, type GatewayConfig, type RequestSummary, type ResilienceConfig, type SimProfile } from "@relay/core";
import { benchTenant, openLoop, pct, q, round } from "./util";

const N = 4000;
const RPS = 20;

export interface ConfigOutcome {
  id: string;
  label: string;
  success: number;
  p50Ms: number;
  p99Ms: number;
  attemptsPerRequest: number;
  failures: Record<string, number>;
}

export interface Scenario {
  id: string;
  label: string;
  detail: string;
  configs: ConfigOutcome[];
}

const POLICIES: { id: string; label: string; cfg: ResilienceConfig }[] = [
  { id: "none", label: "No protection", cfg: { ...STANDARD_RESILIENCE, maxAttempts: 1, fallback: false, breaker: false, hedge: null } },
  { id: "retries", label: "Retries (4 attempts, full jitter)", cfg: { ...STANDARD_RESILIENCE, fallback: false, breaker: false, hedge: null } },
  { id: "full", label: "Retries + fallback + breaker", cfg: { ...STANDARD_RESILIENCE, hedge: null } },
];

function gatewayFor(clock: VirtualClock, cfg: ResilienceConfig, profileFor: (model: string, region: string) => SimProfile, seed: number) {
  const configs: GatewayConfig[] = [{ ...CONFIGS[0], version: "bench", resilience: cfg }];
  return new Gateway({ tenants: [benchTenant()], upstreams: simDeployments(clock, profileFor, seed), configs, stable: "bench", clock, rng: seeded(seed) });
}

async function run(cfg: ResilienceConfig, profileFor: (clock: VirtualClock) => (model: string, region: string) => SimProfile, seed: number): Promise<RequestSummary[]> {
  const clock = new VirtualClock();
  const gw = gatewayFor(clock, cfg, profileFor(clock), seed);
  const next = traffic(seeded(seed + 100), { attack: 0, maxTokens: 200 });
  return openLoop(clock, gw, seeded(seed + 200), N, RPS, () => ({ ...next().req, apiKey: "relay-bench", model: "relay-balanced" }));
}

function outcome(id: string, label: string, xs: RequestSummary[]): ConfigOutcome {
  const ok = xs.filter((s) => s.outcome === "ok");
  const lat = ok.map((s) => s.latencyMs);
  const failures: Record<string, number> = {};
  for (const s of xs) {
    if (s.outcome === "ok") continue;
    const k = s.outcome === "error" && s.status === 200 ? "failed mid-stream" : `${s.status}`;
    failures[k] = (failures[k] ?? 0) + 1;
  }
  return { id, label, success: pct(ok.length / xs.length, 2), p50Ms: Math.round(q(lat, 0.5)), p99Ms: Math.round(q(lat, 0.99)), attemptsPerRequest: round(xs.reduce((a, s) => a + s.attempts, 0) / xs.length, 2), failures };
}

export async function benchResilience(): Promise<Scenario[]> {
  const scenarios: { id: string; label: string; detail: string; profile: (clock: VirtualClock) => (model: string, region: string) => SimProfile }[] = [
    {
      id: "random",
      label: "30% of calls fail, on every deployment",
      detail: "Each call to any model in any region fails independently with p = 0.3: 35% HTTP 500, 20% 429 with retry-after, 20% 529 overloaded, 15% stalls (accepted, then silent), 10% dropped streams.",
      profile: () => (m, r) => liveProfile(m, r, { failRate: 0.3, bothRegions: true, tail: 0.2 }),
    },
    {
      id: "outage",
      label: "Primary region down 30% of the time",
      detail: "us-east returns 500/529 on every call for 6 s out of every 20 s (and 0.5% otherwise); eu-west is healthy. Failures come in bursts, as real outages do.",
      profile: (clock) => (m, r) => {
        const base = liveProfile(m, r, { failRate: 0.005, bothRegions: false, tail: 0.2 });
        const down = r === "us-east" && clock.now() % 20_000 < 6_000;
        return down ? { ...base, failRate: 1, mix: { ...DEFAULT_MIX, error500: 0.5, rate429: 0, overloaded529: 0.5, stall: 0, drop: 0 } } : base;
      },
    },
  ];
  const out: Scenario[] = [];
  for (const sc of scenarios) {
    const configs: ConfigOutcome[] = [];
    for (const p of POLICIES) configs.push(outcome(p.id, p.label, await run(p.cfg, sc.profile, 11)));
    out.push({ id: sc.id, label: sc.label, detail: sc.detail, configs });
  }
  return out;
}

export interface HedgeResult {
  detail: string;
  requests: number;
  without: { ttfbP50: number; ttfbP90: number; ttfbP99: number; latencyP99: number; success: number; upstreamCalls: number };
  with: { ttfbP50: number; ttfbP90: number; ttfbP99: number; latencyP99: number; success: number; upstreamCalls: number };
  hedgedShare: number;
  hedgeWinShare: number;
  extraCalls: number;
  wastedCostShare: number;
}

export async function benchHedging(): Promise<HedgeResult> {
  const tail = 0.6;
  const prof = (m: string, r: string) => liveProfile(m, r, { failRate: 0, bothRegions: false, tail });
  const p = prof("claude-sonnet-5-5", "us-east");
  const base = { ...STANDARD_RESILIENCE };
  const runOne = async (hedge: boolean) => {
    const xs = await run({ ...base, hedge: hedge ? base.hedge : null }, () => prof, 23);
    const ok = xs.filter((s) => s.outcome === "ok");
    const ttfb = ok.map((s) => s.ttfbMs ?? s.latencyMs);
    return {
      xs,
      stats: {
        ttfbP50: Math.round(q(ttfb, 0.5)),
        ttfbP90: Math.round(q(ttfb, 0.9)),
        ttfbP99: Math.round(q(ttfb, 0.99)),
        latencyP99: Math.round(q(ok.map((s) => s.latencyMs), 0.99)),
        success: pct(ok.length / xs.length, 2),
        upstreamCalls: xs.reduce((a, s) => a + s.attempts, 0),
      },
    };
  };
  const a = await runOne(false);
  const b = await runOne(true);
  const hedged = b.xs.filter((s) => s.hedged);
  const cost = b.xs.reduce((x, s) => x + s.costUsd, 0);
  const wasted = b.xs.reduce((x, s) => x + s.wastedUsd, 0);
  return {
    detail: `Time to first token is log-normal around ${p.ttfbMedianMs} ms (σ ${p.ttfbSigma}); ${pct(p.tail.p, 0)}% of calls add a Pareto delay (scale ${(p.tail.scaleMs / 1000).toFixed(1)} s, α ${p.tail.alpha}). No failures. Hedge after the upstream's p95 first-token time, at most 1 hedge per 10 requests.`,
    requests: N,
    without: a.stats,
    with: b.stats,
    hedgedShare: pct(hedged.length / b.xs.length, 1),
    hedgeWinShare: pct(hedged.filter((s) => s.hedgeWon).length / Math.max(1, hedged.length), 0),
    extraCalls: pct(b.stats.upstreamCalls / a.stats.upstreamCalls - 1, 1),
    wastedCostShare: pct(wasted / cost, 2),
  };
}

