import { CONFIGS, Gateway, profile, seeded, SimUpstream, VirtualClock, type GatewayOptions, type RelayResponse, type SimProfile, type StreamEvent, type TenantConfig } from "@relay/core";

/** Waits for `p` while running the virtual clock, so timers inside it fire. */
export async function drive<T>(clock: VirtualClock, p: Promise<T>): Promise<T> {
  let settled = false;
  p.then(
    () => (settled = true),
    () => (settled = true),
  );
  await clock.run({ until: () => settled });
  return p;
}

export async function drain(res: RelayResponse): Promise<{ text: string; events: StreamEvent[] }> {
  const events: StreamEvent[] = [];
  let text = "";
  if (res.events)
    for await (const ev of res.events) {
      events.push(ev);
      if (ev.type === "text") text += ev.text;
    }
  return { text, events };
}

export const tenant = (over: Partial<TenantConfig> = {}): TenantConfig => ({
  id: "t1",
  name: "Tenant One",
  keys: ["key-1"],
  limits: { requestsPerMinute: 10_000, tokensPerMinute: 10_000_000 },
  budgetUsd: 1000,
  budgetWindowMs: 60_000,
  cache: null,
  redaction: "reversible",
  screen: { flag: 0.4, block: 0.7 },
  maxTier: "best",
  ...over,
});

/** A gateway on a virtual clock with one simulated deployment per model and region. */
export function simGateway(opts: { profile?: (model: string, region: string) => SimProfile; tenants?: TenantConfig[]; regions?: string[]; seed?: number; extra?: Partial<GatewayOptions> } = {}) {
  const clock = new VirtualClock();
  const regions = opts.regions ?? ["us-east", "eu-west"];
  const models = ["claude-haiku-4-5", "claude-sonnet-5-5", "claude-opus-5-5"];
  const sims: SimUpstream[] = [];
  for (const m of models) for (const r of regions) sims.push(new SimUpstream(m, r, clock, () => (opts.profile ? opts.profile(m, r) : profile({ zeroLatency: true })), opts.seed ?? 1));
  const gw = new Gateway({ tenants: opts.tenants ?? [tenant()], upstreams: sims, configs: CONFIGS, stable: "v1", clock, rng: seeded(opts.seed ?? 1), ...opts.extra });
  const sim = (model: string, region = regions[0]) => sims.find((s) => s.model === model && s.region === region)!;
  return { clock, gw, sims, sim };
}

/** Sends one request and drains it, driving the virtual clock throughout. */
export async function ask(g: { clock: VirtualClock; gw: Gateway }, content: string, over: Partial<Parameters<Gateway["handle"]>[0]> = {}) {
  return drive(
    g.clock,
    (async () => {
      const res = await g.gw.handle({ apiKey: "key-1", model: "relay-balanced", messages: [{ role: "user", content }], maxTokens: 400, ...over });
      const out = await drain(res);
      const summary = await res.done;
      return { res, ...out, summary };
    })(),
  );
}
