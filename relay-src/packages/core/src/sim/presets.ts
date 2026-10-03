// The demo deployment: three tenants, four config versions (the stable one, a
// good candidate, and two regressions for the canary to catch), and simulator
// profiles for three models in two regions.

import type { Clock } from "../clock";
import { CATALOG } from "../routing";
import type { GatewayConfig, ResilienceConfig, TenantConfig } from "../types";
import { profile, SimUpstream, type SimProfile } from "./simulator";

export const STANDARD_RESILIENCE: ResilienceConfig = {
  maxAttempts: 4,
  attemptsPerUpstream: 2,
  fallback: true,
  breaker: true,
  backoff: { baseMs: 100, capMs: 2000 },
  firstTokenTimeoutMs: 4000,
  idleTimeoutMs: 2500,
  deadlineMs: 15000,
  hedge: { quantile: 0.95, minSamples: 20, floorMs: 50 },
};

/**
 * For the real Anthropic API. Models that think before they write can take many
 * seconds to the first text, so the first-token and idle timeouts are long, and
 * hedging is off: a hedge would bill the caller twice for every slow answer.
 */
export const REAL_API_RESILIENCE: ResilienceConfig = {
  ...STANDARD_RESILIENCE,
  maxAttempts: 3,
  backoff: { baseMs: 250, capMs: 4000 },
  firstTokenTimeoutMs: 60_000,
  idleTimeoutMs: 30_000,
  deadlineMs: 180_000,
  hedge: null,
};

/** The demo configs with resilience settings for the real API. */
export const realApiConfigs = (configs: GatewayConfig[] = CONFIGS): GatewayConfig[] => configs.map((c) => ({ ...c, resilience: { ...REAL_API_RESILIENCE, maxAttempts: Math.min(REAL_API_RESILIENCE.maxAttempts, c.resilience.maxAttempts) } }));

const SYSTEM = "You are the support assistant for Kestrel Labs, a software company. Answer accurately and briefly.";

export const CONFIGS: GatewayConfig[] = [
  { version: "v1", label: "v1 · current", note: "The config in production.", systemPrompt: SYSTEM, routing: { classifier: "standard" }, resilience: STANDARD_RESILIENCE },
  {
    version: "v2",
    label: "v2 · shorter answers",
    note: "Adds a word limit to the system prompt. Should pass every gate.",
    systemPrompt: SYSTEM + " Keep answers under 120 words.",
    routing: { classifier: "standard" },
    resilience: STANDARD_RESILIENCE,
  },
  {
    version: "v3",
    label: "v3 · cheaper routing",
    note: "Sends every auto-routed request to the fast tier to cut cost. Code and multi-step questions get worse; the eval gate should catch it.",
    systemPrompt: SYSTEM,
    routing: { classifier: "cost-cut" },
    resilience: STANDARD_RESILIENCE,
  },
  {
    version: "v4",
    label: "v4 · tight timeouts",
    note: "Cuts the first-token timeout to 300 ms and retries to one. The evals run on a zero-latency simulator and pass; live traffic should fail.",
    systemPrompt: SYSTEM,
    routing: { classifier: "standard" },
    resilience: { ...STANDARD_RESILIENCE, firstTokenTimeoutMs: 300, maxAttempts: 2, hedge: null },
  },
];

const MIN = 60_000;

export const TENANTS: TenantConfig[] = [
  {
    id: "acme",
    name: "Acme Corp",
    keys: ["relay-demo-acme"],
    limits: { requestsPerMinute: 1200, tokensPerMinute: 600_000 },
    budgetUsd: 5,
    budgetWindowMs: MIN,
    cache: { ttlMs: 10 * MIN, near: true, threshold: 0.6 },
    redaction: "reversible",
    screen: { flag: 0.4, block: 0.7 },
    maxTier: "best",
  },
  {
    id: "globex",
    name: "Globex",
    keys: ["relay-demo-globex"],
    limits: { requestsPerMinute: 600, tokensPerMinute: 300_000 },
    budgetUsd: 2,
    budgetWindowMs: MIN,
    cache: { ttlMs: 5 * MIN, near: false, threshold: 1 },
    redaction: "mask",
    screen: { flag: 0.4, block: 0.7 },
    maxTier: "balanced",
  },
  {
    id: "trial",
    name: "Trial key",
    keys: ["relay-demo-trial"],
    limits: { requestsPerMinute: 20, tokensPerMinute: 30_000 },
    budgetUsd: 0.004,
    budgetWindowMs: MIN,
    cache: { ttlMs: 2 * MIN, near: true, threshold: 0.6 },
    redaction: "reversible",
    screen: { flag: 0.35, block: 0.6 },
    maxTier: "fast",
  },
];

export const EVAL_TENANT: TenantConfig = {
  id: "eval",
  name: "Eval suite",
  keys: ["relay-eval"],
  limits: { requestsPerMinute: 100_000, tokensPerMinute: 100_000_000 },
  budgetUsd: 1e6,
  budgetWindowMs: MIN,
  cache: null,
  redaction: "reversible",
  screen: { flag: 0.4, block: 0.7 },
  maxTier: "best",
};

export const REGIONS = ["us-east", "eu-west"] as const;

/** Per-model speed: smaller models answer sooner and stream faster. */
export const MODEL_SPEED: Record<string, { ttfbMedianMs: number; tokensPerSec: number }> = {
  "claude-haiku-4-5": { ttfbMedianMs: 260, tokensPerSec: 220 },
  "claude-sonnet-5-5": { ttfbMedianMs: 420, tokensPerSec: 140 },
  "claude-opus-5-5": { ttfbMedianMs: 640, tokensPerSec: 90 },
};

export interface LiveKnobs {
  /** Failure probability injected into us-east (the primary region). */
  failRate: number;
  /** Also inject it into eu-west. */
  bothRegions: boolean;
  /** 0..1, scales how often and how far the latency tail reaches. */
  tail: number;
}

/** The simulator profile for one deployment under the page's sliders. */
export function liveProfile(model: string, region: string, knobs: LiveKnobs): SimProfile {
  const speed = MODEL_SPEED[model] ?? MODEL_SPEED["claude-sonnet-5-5"];
  const primary = region === REGIONS[0];
  return profile({
    ttfbMedianMs: speed.ttfbMedianMs + (primary ? 0 : 40),
    tokensPerSec: speed.tokensPerSec,
    tail: { p: 0.01 + 0.12 * knobs.tail, scaleMs: 300 + 1500 * knobs.tail, alpha: 1.3 },
    failRate: primary || knobs.bothRegions ? knobs.failRate : 0.005,
  });
}

export function simDeployments(clock: Clock, profileFor: (model: string, region: string) => SimProfile, seed = 1, regions: readonly string[] = REGIONS): SimUpstream[] {
  const out: SimUpstream[] = [];
  for (const m of CATALOG) for (const r of regions) out.push(new SimUpstream(m.id, r, clock, () => profileFor(m.id, r), seed));
  return out;
}
