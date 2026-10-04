// Gateway overhead: wall-clock CPU each middleware adds, against a simulator
// that answers instantly (no sleeping, no network), on a realistic request mix.
// Stage times are self times measured inside the chain (see compose() in
// gateway.ts): a stage's own work, request phase plus stream phase, excluding
// the stages it wraps and any waiting.

import { CONFIGS, Gateway, profile, seeded, simDeployments, STAGES, systemClock, traffic, type RequestSummary, type Stage } from "@relay/core";
import { benchTenant, consume, q, round } from "./util";

type Dist = { p50: number; p99: number; mean: number };

export interface OverheadResult {
  requests: number;
  warmup: number;
  mix: { cacheHits: number; blocked: number; withPii: number };
  /** Sum of the nine stages' self times per served request, µs. */
  gateway: Dist;
  /** Requests that went to the upstream: every stage runs. */
  miss: Dist & { n: number; stages: Record<Stage, Dist> };
  /** Requests answered from the cache: route, meter and resilience never run. */
  hit: Dist & { n: number; stages: Record<Stage, Dist> };
  /** CPU spent inside the simulator generating the answer (not gateway work), µs. */
  simulator: { p50: number; p99: number };
  throughputPerSec: number;
}

export async function benchOverhead(opts: { requests?: number; warmup?: number } = {}): Promise<OverheadResult> {
  const requests = opts.requests ?? 20_000;
  const warmup = opts.warmup ?? 3000;
  const tenant = benchTenant({ cache: { ttlMs: 3_600_000, near: true, threshold: 0.6 } });
  const gw = new Gateway({
    tenants: [tenant],
    upstreams: simDeployments(systemClock, () => profile({ zeroLatency: true }), 1),
    configs: CONFIGS,
    stable: "v1",
    clock: systemClock,
    rng: seeded(1),
    cacheCapacity: 2000,
  });
  const next = traffic(seeded(42), { maxTokens: 300 });
  const all: RequestSummary[] = [];
  const t0 = performance.now();
  for (let i = 0; i < warmup + requests; i++) {
    const item = next();
    const s = await consume(await gw.handle({ ...item.req, apiKey: tenant.keys[0] }));
    if (i < warmup) continue;
    all.push(s);
  }
  const elapsed = performance.now() - t0;

  const served = all.filter((s) => s.status === 200);
  const sum = (s: RequestSummary) => STAGES.reduce((a, st) => a + s.trace.stages[st], 0);
  const dist = (xs: number[]): Dist => ({ p50: round(q(xs, 0.5)), p99: round(q(xs, 0.99)), mean: round(xs.reduce((a, b) => a + b, 0) / xs.length) });
  const group = (xs: RequestSummary[]) => ({
    n: xs.length,
    ...dist(xs.map(sum)),
    stages: Object.fromEntries(STAGES.map((st) => [st, dist(xs.map((s) => s.trace.stages[st]))])) as Record<Stage, Dist>,
  });
  const misses = served.filter((s) => s.cache === "miss");
  const hits = served.filter((s) => s.cache === "exact" || s.cache === "near");
  return {
    requests,
    warmup,
    mix: {
      cacheHits: round(hits.length / served.length, 3),
      blocked: round(all.filter((s) => s.status === 400).length / all.length, 3),
      withPii: round(served.filter((s) => s.redactions > 0).length / served.length, 3),
    },
    gateway: dist(served.map(sum)),
    miss: group(misses),
    hit: group(hits),
    simulator: { p50: round(q(misses.map((s) => s.trace.upstreamUs), 0.5)), p99: round(q(misses.map((s) => s.trace.upstreamUs), 0.99)) },
    throughputPerSec: Math.round(((warmup + requests) / elapsed) * 1000),
  };
}
