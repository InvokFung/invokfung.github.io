import { quantile, sleep, VirtualClock, type Gateway, type RelayRequest, type RelayResponse, type RequestSummary, type Rng, type TenantConfig } from "@relay/core";

export const round = (x: number, d = 1) => {
  const f = 10 ** d;
  return Math.round(x * f) / f;
};
export const pct = (x: number, d = 1) => round(x * 100, d);
export const q = (xs: number[], p: number) => (xs.length ? quantile(xs, p) : NaN);

/** Runs `p` to completion while firing the virtual clock's timers. */
export async function drive<T>(clock: VirtualClock, p: Promise<T>): Promise<T> {
  let settled = false;
  p.then(
    () => (settled = true),
    () => (settled = true),
  );
  await clock.run({ until: () => settled });
  return p;
}

export async function consume(res: RelayResponse): Promise<RequestSummary> {
  if (res.events) for await (const ev of res.events) void ev;
  return res.done;
}

/** A tenant with no limits worth hitting, so a benchmark measures the mechanism under test. */
export const benchTenant = (over: Partial<TenantConfig> = {}): TenantConfig => ({
  id: "bench",
  name: "Bench",
  keys: ["relay-bench"],
  limits: { requestsPerMinute: 1e9, tokensPerMinute: 1e12 },
  budgetUsd: 1e9,
  budgetWindowMs: 60_000,
  cache: null,
  redaction: "reversible",
  screen: { flag: 0.4, block: 0.7 },
  maxTier: "best",
  ...over,
});

/**
 * Open-loop load in virtual time: Poisson arrivals at `rps`, each request
 * running concurrently with the others, the way real traffic arrives.
 */
export async function openLoop(clock: VirtualClock, gw: Gateway, rng: Rng, n: number, rps: number, next: (i: number) => RelayRequest): Promise<RequestSummary[]> {
  const out: RequestSummary[] = [];
  const inflight: Promise<void>[] = [];
  await drive(
    clock,
    (async () => {
      for (let i = 0; i < n; i++) {
        const req = next(i);
        inflight.push(
          (async () => {
            out.push(await consume(await gw.handle(req)));
          })(),
        );
        await sleep(clock, -Math.log(1 - rng.next()) * (1000 / rps));
      }
      await Promise.all(inflight);
    })(),
  );
  return out;
}
