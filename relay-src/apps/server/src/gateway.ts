// Builds the gateway the server hosts: the demo tenants and configs, and either
// the simulator (two regions per model) or the real Anthropic API, one
// deployment per model, when ANTHROPIC_API_KEY is set.

import { AnthropicUpstream, CATALOG, CONFIGS, Gateway, liveProfile, realApiConfigs, simDeployments, systemClock, TENANTS, type FetchLike, type TenantConfig, type Upstream } from "@relay/core";

export interface GatewaySetup {
  gateway: Gateway;
  upstream: "simulator" | "anthropic";
}

export function buildGateway(env: Record<string, string | undefined>, opts: { fetch?: FetchLike; tenants?: TenantConfig[] } = {}): GatewaySetup {
  const key = env.ANTHROPIC_API_KEY?.trim();
  let upstreams: Upstream[];
  if (key) {
    const f = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    upstreams = CATALOG.map((m) => new AnthropicUpstream({ apiKey: key, model: m.id, effort: m.effort, fetch: f, region: "anthropic" }));
  } else {
    const failRate = Math.min(1, Math.max(0, Number(env.RELAY_SIM_FAIL_RATE ?? 0) || 0));
    const tail = Math.min(1, Math.max(0, Number(env.RELAY_SIM_TAIL ?? 0.2) || 0));
    upstreams = simDeployments(systemClock, (m, r) => liveProfile(m, r, { failRate, bothRegions: false, tail }), Number(env.RELAY_SIM_SEED ?? 1) || 1);
  }
  const gateway = new Gateway({ tenants: opts.tenants ?? TENANTS, upstreams, configs: key ? realApiConfigs() : CONFIGS, stable: env.RELAY_CONFIG ?? "v1", clock: systemClock });
  return { gateway, upstream: key ? "anthropic" : "simulator" };
}
