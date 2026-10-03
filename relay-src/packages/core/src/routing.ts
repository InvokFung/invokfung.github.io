// Policy routing: pick the cheapest model whose capability tier meets the
// request, then lay out the fallback chain the resilience layer walks.

import { tierRank, type GatewayConfig, type ModelInfo, type Tier, type Upstream } from "./types";

/** Anthropic list prices, USD per million tokens (input / output). */
export const CATALOG: readonly ModelInfo[] = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5", tier: "fast", inputPerMTok: 1, outputPerMTok: 5 },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", tier: "balanced", inputPerMTok: 2, outputPerMTok: 10, effort: "low" },
  { id: "claude-opus-5-5", label: "Opus 5.5", tier: "best", inputPerMTok: 4, outputPerMTok: 20, effort: "low" },
];

export const modelInfo = (id: string, catalog: readonly ModelInfo[] = CATALOG): ModelInfo | undefined => catalog.find((m) => m.id === id);

const CODE = /```|\b(?:function|regexp?|stack ?trace|exception|segfault|compiler?|TypeScript|JavaScript|Python|Rust|Golang|SQL|bash|kubectl|docker|algorithm|refactor|unit tests?)\b|\w\(\)/i;
const REASONING = /\b(?:prove|proof|step by step|derive|analy[sz]e|compare|trade-?offs?|design|architect|strategy|evaluate|why does|explain why|optimi[sz]e|estimate|calculate|compute|how many)\b|\(\s*\d+\s*[-+*\/]/i;

export interface RouteDecision {
  tier: Tier;
  /** Why this tier: "requested", "auto: code", … */
  reason: string;
  /** Deployments in the order resilience should try them. */
  chain: Upstream[];
  /** The model the request was pinned to, if it named one. */
  pinned?: string;
}

/** Tier for `relay-auto` requests. "cost-cut" is the regression the canary demo rolls back. */
export function classify(prompt: string, classifier: GatewayConfig["routing"]["classifier"]): { tier: Tier; reason: string } {
  if (classifier === "cost-cut") return { tier: "fast", reason: "auto: cost-cut policy" };
  if (CODE.test(prompt)) return { tier: "balanced", reason: "auto: code" };
  if (REASONING.test(prompt)) return { tier: "balanced", reason: "auto: reasoning" };
  if (prompt.length > 1500) return { tier: "balanced", reason: "auto: long input" };
  return { tier: "fast", reason: "auto: short question" };
}

/** Resolves the `model` field: a tier alias, "relay-auto", or a concrete model id. */
export function requestedTier(model: string, prompt: string, cfg: GatewayConfig, catalog: readonly ModelInfo[] = CATALOG): { tier: Tier; reason: string; pinned?: string } | null {
  const m = /^relay-(auto|fast|balanced|best)$/.exec(model);
  if (m) return m[1] === "auto" ? classify(prompt, cfg.routing.classifier) : { tier: m[1] as Tier, reason: "requested" };
  const info = modelInfo(model, catalog);
  return info ? { tier: info.tier, reason: "model named", pinned: info.id } : null;
}

/**
 * Cheapest capable model first, every region of it, then the next model up.
 * A pinned model goes first; cheaper models never serve a request that asked
 * for more capability.
 */
export function buildChain(tier: Tier, upstreams: readonly Upstream[], catalog: readonly ModelInfo[] = CATALOG, pinned?: string): Upstream[] {
  const models = catalog
    .filter((m) => tierRank(m.tier) >= tierRank(tier))
    .sort((a, b) => (a.id === pinned ? -1 : b.id === pinned ? 1 : a.outputPerMTok - b.outputPerMTok || a.inputPerMTok - b.inputPerMTok));
  const chain: Upstream[] = [];
  for (const m of models) for (const u of upstreams) if (u.model === m.id) chain.push(u);
  return chain;
}
