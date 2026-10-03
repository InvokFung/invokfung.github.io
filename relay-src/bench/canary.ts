// Scripted canary rollouts in virtual time: a good change and two regressions,
// with live traffic flowing, recording every gate decision.

import { CanaryController, CONFIGS, Gateway, liveProfile, runEvalSuite, seeded, simDeployments, sleep, traffic, VirtualClock, type CanaryState, type GateCheck } from "@relay/core";
import { benchTenant, consume, drive } from "./util";

export interface CanaryRun {
  version: string;
  label: string;
  note: string;
  status: CanaryState["status"];
  reason: string | null;
  evalPassed: string[];
  failedEvals: string[];
  steps: { weight: number; ok: boolean; canaryN: number; stableN: number; checks: GateCheck[] }[];
  canaryRequests: number;
  /** Virtual seconds from start to the final decision. */
  decidedAfterS: number;
}

export async function benchCanary(): Promise<CanaryRun[]> {
  const out: CanaryRun[] = [];
  for (const version of ["v2", "v3", "v4"]) {
    const clock = new VirtualClock();
    const gw = new Gateway({
      tenants: [benchTenant()],
      upstreams: simDeployments(clock, (m, r) => liveProfile(m, r, { failRate: 0.02, bothRegions: false, tail: 0.2 }), 7),
      configs: CONFIGS,
      stable: "v1",
      clock,
      rng: seeded(7),
    });
    let decidedAt = 0;
    const canary = new CanaryController({
      clock,
      stable: "v1",
      runEvals: (v) => runEvalSuite(v),
      onChange: (s) => {
        if (s.status === "promoted" || s.status === "rolled-back") decidedAt = clock.now();
      },
      onPromote: (v) => (gw.stable = v),
    });
    gw.canary = canary;
    const next = traffic(seeded(17), { attack: 0, maxTokens: 300 });
    let canaryN = 0;
    const inflight: Promise<void>[] = [];
    await drive(
      clock,
      (async () => {
        const begun = canary.begin(version);
        while (clock.now() < 600_000) {
          const req = { ...next().req, apiKey: "relay-bench" };
          inflight.push(
            (async () => {
              const s = await consume(await gw.handle(req));
              if (s.configVersion === version) canaryN++;
            })(),
          );
          await sleep(clock, 40);
          canary.tick();
          if (!canary.active) break;
        }
        await begun;
        await Promise.all(inflight);
      })(),
    );
    const s = canary.state;
    const cfg = CONFIGS.find((c) => c.version === version)!;
    out.push({
      version,
      label: cfg.label,
      note: cfg.note ?? "",
      status: s.status,
      reason: s.reason,
      evalPassed: s.evals.map((e) => `${e.passed}/${e.total}`),
      failedEvals: [...new Set(s.evals.flatMap((e) => e.tasks.filter((t) => !t.pass).map((t) => t.title)))],
      steps: s.results.map((r) => ({ weight: r.weight, ok: r.ok, canaryN: r.canaryN, stableN: r.stableN, checks: r.checks })),
      canaryRequests: canaryN,
      decidedAfterS: Math.round(decidedAt / 100) / 10,
    });
  }
  return out;
}
