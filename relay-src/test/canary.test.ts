import { test } from "node:test";
import assert from "node:assert/strict";
import { CanaryController, liveProfile, quantile, runEvalSuite, sleep, VirtualClock, type CanaryState, type RequestSummary } from "@relay/core";
import { drain, drive, simGateway } from "./helpers";

const PROMPTS = ["How do I reset my password?", "I was charged twice, can I get my money back?", "How do I export my data as CSV?", "What is 17 * 23?", "Can I change the email on my account?"];

/**
 * Starts a rollout of `candidate` and sends live traffic (one request every 40 ms of
 * virtual time, each in flight concurrently) until the rollout ends.
 */
async function rollout(candidate: string, failRate = 0) {
  const g = simGateway({ profile: (m, r) => liveProfile(m, r, { failRate, bothRegions: false, tail: 0.2 }), seed: 3 });
  const history: CanaryState["status"][] = [];
  const canary = new CanaryController({
    clock: g.clock,
    stable: "v1",
    runEvals: (v) => runEvalSuite(v),
    onChange: (s) => history.at(-1) !== s.status && history.push(s.status),
    onPromote: (v) => (g.gw.stable = v),
  });
  g.gw.canary = canary;
  const seen = new Map<string, number>();
  const inflight: Promise<void>[] = [];
  await drive(
    g.clock,
    (async () => {
      const begun = canary.begin(candidate);
      for (let i = 0; g.clock.now() < 600_000; i++) {
        inflight.push(
          (async () => {
            const res = await g.gw.handle({ apiKey: "key-1", model: "relay-auto", messages: [{ role: "user", content: PROMPTS[i % PROMPTS.length] }], maxTokens: 300 });
            await drain(res);
            const s = await res.done;
            seen.set(s.configVersion, (seen.get(s.configVersion) ?? 0) + 1);
          })(),
        );
        await sleep(g.clock, 40);
        canary.tick();
        if (!canary.active) break;
      }
      await begun;
      await Promise.all(inflight);
    })(),
  );
  return { g, canary, history, seen };
}

test("canary: a good change (v2) passes every gate at 5%, 25% and 100% and becomes stable", async () => {
  const { g, canary, history, seen } = await rollout("v2");
  const s = canary.state;
  assert.equal(s.status, "promoted", s.reason ?? "");
  assert.deepEqual(
    s.results.map((r) => [r.weight, r.ok]),
    [
      [0.05, true],
      [0.25, true],
      [1, true],
    ],
  );
  assert.equal(s.evals.length, 3, "the eval suite ran before each step");
  assert.ok(s.evals.every((e) => e.passRate === 1));
  for (const r of s.results)
    assert.deepEqual(
      r.checks.map((c) => c.gate),
      ["eval", "errors", "latency"],
    );
  assert.equal(g.gw.stable, "v2");
  assert.ok(seen.get("v2")! >= 12 + 20 + 30);
  assert.deepEqual(history, ["evaluating", "observing", "evaluating", "observing", "evaluating", "observing", "promoted"]);
});

test("canary: v3 (cheaper routing) is rolled back by the eval gate before taking any traffic", async () => {
  const { g, canary, seen } = await rollout("v3");
  const s = canary.state;
  assert.equal(s.status, "rolled-back");
  assert.equal(s.results.length, 1);
  assert.equal(s.results[0].checks[0].gate, "eval");
  assert.match(s.reason!, /eval gate before 5%/);
  assert.match(s.reason!, /code|math|reasoning/);
  assert.ok(s.evals[0].passRate < 0.95);
  assert.equal(seen.get("v3") ?? 0, 0, "no live request ran under v3");
  assert.equal(g.gw.stable, "v1");
});

test("canary: v4 (tight timeouts) passes the evals, then live errors roll it back at 5%", async () => {
  const { g, canary, seen } = await rollout("v4");
  const s = canary.state;
  assert.equal(s.evals[0].passRate, 1, "the zero-latency eval run cannot see a timeout problem");
  assert.equal(s.status, "rolled-back");
  assert.equal(s.results.length, 1);
  assert.equal(s.results[0].weight, 0.05);
  const errors = s.results[0].checks.find((c) => c.gate === "errors")!;
  assert.equal(errors.ok, false);
  assert.match(s.reason!, /error rate gate at 5%/);
  assert.ok(seen.get("v4")! >= 5 && seen.get("v4")! < 40, `${seen.get("v4")} requests under v4 before rollback`);
  assert.equal(g.gw.stable, "v1");
  // After the rollback every request is back on stable.
  assert.equal(canary.route("msg_any_id"), "v1");
});

test("canary: the error gate tolerates noise in a good candidate", async () => {
  // 5% injected failures everywhere, so stable and canary both see errors; v2 is still fine.
  const { canary } = await rollout("v2", 0.05);
  assert.equal(canary.state.status, "promoted", canary.state.reason ?? "");
});

test("canary: no traffic is not a pass", async () => {
  const g = simGateway();
  const canary = new CanaryController({ clock: g.clock, stable: "v1", runEvals: (v) => runEvalSuite(v) });
  await canary.begin("v2");
  assert.equal(canary.state.status, "observing");
  await g.clock.advance(61_000);
  canary.tick();
  assert.equal(canary.state.status, "rolled-back");
  assert.match(canary.state.reason!, /not enough traffic/);
});

// ------------------------------------------------------------ gates in isolation

function summary(version: string, latencyMs: number, over: Partial<RequestSummary> = {}): RequestSummary {
  return {
    id: "x",
    tenant: "t",
    configVersion: version,
    canary: version !== "v1",
    model: "relay-auto",
    status: 200,
    outcome: "ok",
    cache: "miss",
    attempts: 1,
    retries: 0,
    hedged: false,
    hedgeWon: false,
    fellBack: false,
    latencyMs,
    ttfbMs: latencyMs / 2,
    inputTokens: 10,
    outputTokens: 10,
    costUsd: 0,
    savedUsd: 0,
    wastedUsd: 0,
    redactions: 0,
    screenScore: 0,
    verdict: "pass",
    trace: { stages: { auth: 0, limit: 0, redact: 0, screen: 0, cache: 0, route: 0, resilience: 0, meter: 0, audit: 0 }, upstreamUs: 0, totalUs: 0 },
    decisions: [],
    startedAt: 0,
    endedAt: 0,
    ...over,
  };
}

async function oneStep(canaryLatencies: number[], stableLatencies: number[], extra: RequestSummary[] = []) {
  const clock = new VirtualClock();
  const pass = { version: "v2", passed: 1, total: 1, passRate: 1, tasks: [] };
  const canary = new CanaryController({ clock, stable: "v1", runEvals: async () => pass, steps: [{ weight: 1, minSamples: canaryLatencies.length, minDwellMs: 0, maxDwellMs: 1e9 }] });
  await canary.begin("v2");
  const at = { startedAt: clock.now(), endedAt: clock.now() };
  for (const x of extra) canary.observe({ ...x, ...at });
  for (const ms of stableLatencies) canary.observe(summary("v1", ms, at));
  for (const ms of canaryLatencies) canary.observe(summary("v2", ms, at));
  canary.tick();
  return canary.state;
}

test("canary: the latency gate ignores one slow outlier but rolls back a slower distribution", async () => {
  const stable = Array.from({ length: 40 }, (_, i) => 400 + (i % 10) * 20);
  const outlier = [...Array.from({ length: 11 }, (_, i) => 410 + i * 15), 9000];
  let s = await oneStep(outlier, stable);
  assert.equal(s.status, "promoted", s.reason ?? "");
  assert.ok(quantile(outlier, 0.95) > 1.5 * quantile(stable, 0.95), "the raw p95 alone would have failed it");

  const slower = Array.from({ length: 12 }, (_, i) => 900 + i * 30);
  s = await oneStep(slower, stable);
  assert.equal(s.status, "rolled-back");
  assert.match(s.reason ?? "", /^latency gate/);
});

test("canary: cache hits are not evidence about a config", async () => {
  const hits = Array.from({ length: 30 }, () => summary("v2", 1, { cache: "exact", status: 200 }));
  const s = await oneStep(
    Array.from({ length: 12 }, () => 450),
    Array.from({ length: 20 }, () => 450),
    hits,
  );
  assert.equal(s.results[0].canaryN, 12, "only the 12 upstream-served canary requests count");
});
