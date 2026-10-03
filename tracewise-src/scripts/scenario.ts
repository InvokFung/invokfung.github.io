// One evaluation run: simulate, inject a fault (or not), and record when the
// pipeline noticed and how it ranked the culprit. Used by scripts/eval.ts.

import { simPipelineOptions } from "../src/core/config";
import { Pipeline, MINUTE_MS, type Alert, type MinuteSummary } from "../src/core/pipeline";
import { Rng } from "../src/core/rng";
import { Simulator, FAULT_KINDS, type FaultKind } from "../src/core/sim";
import { exactQuantile } from "../src/core/sketch";
import { SERVICES } from "../src/core/topology";

export interface FaultJob {
  kind: "fault";
  id: number;
  seed: number;
  startHour: number;
  service: string;
  fault: FaultKind;
  magnitude: number;
  /** Simulated ms. */
  injectAt: number;
}

export interface CleanJob {
  kind: "clean";
  id: number;
  seed: number;
  startHour: number;
  hours: number;
  /** Collect exact flow latencies to score the sketch. */
  exact: boolean;
}

export type Job = FaultJob | CleanJob;

export const WARMUP_MIN = 60;
export const WINDOW_MIN = 20;
/** Minutes after injection always simulated, to measure the fault's impact. */
export const IMPACT_MIN = 5;

export const METHODS = ["tracewise", "p99Jump", "highestP99", "alerting", "anomalyOnly", "pagerankOnly", "noCriticalPath", "selfOnlyWalk"] as const;
export type Method = (typeof METHODS)[number];

export interface FaultResult {
  kind: "fault";
  id: number;
  service: string;
  fault: FaultKind;
  magnitude: number;
  startHour: number;
  /** Minutes from injection to the first alert, or null if none within the window. */
  detectMin: number | null;
  firstAlert: Alert["kind"] | null;
  alertFlow: string | null;
  /** 1-based rank of the true culprit per method (null when not detected). */
  rank: Record<Method, number | null>;
  top3: string[];
  /** Other services that also looked anomalous (anomaly >= 0.5) when ranked: a cascade. */
  others: number;
  /** Alerts before injection, after the detector warm-up: false alarms. */
  preAlerts: number;
  preHours: number;
  impact: { p95Ratio: number; errDelta: number; visible: boolean };
  spans: number;
  traces: number;
  kept: number;
  byReason: Record<string, number>;
  errorTraces: number;
  errorKept: number;
  seconds: number;
}

export interface CleanResult {
  kind: "clean";
  id: number;
  hours: number;
  alertHours: number;
  alerts: number;
  /** What fired, for debugging false alarms. */
  alertList: string[];
  incidents: number;
  spans: number;
  traces: number;
  kept: number;
  byReason: Record<string, number>;
  errorTraces: number;
  errorKept: number;
  seconds: number;
  /** Relative error of sketch quantiles against exact ones, per flow-minute. */
  sketchErr?: { p50: number[]; p95: number[]; p99: number[] };
}

export type Result = FaultResult | CleanResult;

/** Draw a fault scenario. Deploys only apply to services that report a version. */
export function drawFault(rng: Rng, id: number, seed: number): FaultJob {
  const service = rng.pick(SERVICES).id;
  const instrumented = SERVICES.find((s) => s.id === service)!.instrumented;
  const kinds = FAULT_KINDS.filter((k) => k !== "deploy" || instrumented);
  const fault = rng.pick(kinds);
  const magnitude =
    fault === "latency" ? rng.logRange(5, 300) : fault === "errors" ? rng.logRange(0.02, 0.4) : fault === "capacity" ? rng.range(0.5, 0.95) : fault === "timeout" ? rng.logRange(0.02, 0.3) : rng.range(1.5, 5);
  return { kind: "fault", id, seed, startHour: rng.range(0, 24), service, fault, magnitude, injectAt: WARMUP_MIN * MINUTE_MS + rng.range(0, MINUTE_MS) };
}

export function run(job: Job): Result {
  const t0 = performance.now();
  const exact = job.kind === "clean" && job.exact ? new Map<string, number[]>() : null;
  const pipe = new Pipeline(
    simPipelineOptions(
      exact
        ? {
            onTrace: (t) => {
              if (!t.flow || t.fragment) return;
              const k = `${t.minute}|${t.flow}`;
              (exact.get(k) ?? exact.set(k, []).get(k)!).push(t.durMs);
            },
          }
        : {},
    ),
  );
  const sim = new Simulator({ seed: job.seed, startHour: job.startHour, onSpan: (s) => pipe.ingest(s) });
  const step = 1000;
  const warmMs = pipe.opts.warmupMin * MINUTE_MS;

  if (job.kind === "clean") {
    const end = job.hours * 3_600_000;
    for (let t = step; t <= end; t += step) {
      sim.runUntil(t);
      pipe.advance(t);
    }
    const res: CleanResult = {
      kind: "clean",
      id: job.id,
      hours: job.hours,
      alertHours: (end - warmMs) / 3_600_000,
      alerts: pipe.alerts.filter((a) => a.firedAt >= warmMs).length,
      alertList: pipe.alerts.filter((a) => a.firedAt >= warmMs).map((a) => `${a.minute}@${sim.hourAt(a.firedAt).toFixed(1)}h ${a.flow}:${a.kind} ${a.detail}`),
      incidents: pipe.incidents.length,
      ...samplingStats(pipe),
      seconds: (performance.now() - t0) / 1000,
    };
    if (exact) res.sketchErr = sketchErrors(pipe.history, exact);
    return res;
  }

  let t = step;
  for (; t < job.injectAt; t += step) {
    sim.runUntil(t);
    pipe.advance(t);
  }
  sim.runUntil(job.injectAt);
  const preAlerts = pipe.alerts.filter((a) => a.firedAt >= warmMs).length;
  const alertsBefore = pipe.alerts.length;
  sim.inject({ service: job.service, kind: job.fault, magnitude: job.magnitude });
  const injectMinute = Math.floor(job.injectAt / MINUTE_MS);
  const deadline = job.injectAt + WINDOW_MIN * MINUTE_MS + pipe.opts.decisionWaitMs;
  const impactUntil = (injectMinute + IMPACT_MIN + 1) * MINUTE_MS + pipe.opts.decisionWaitMs;
  let detected: Alert | null = null;
  let rca: ReturnType<Pipeline["rank"]> | null = null;
  for (; t <= deadline; t += step) {
    sim.runUntil(t);
    pipe.advance(t);
    if (!detected && pipe.alerts.length > alertsBefore) {
      detected = pipe.alerts[alertsBefore];
      // Rank as the pipeline would for an incident opened by this alert.
      rca = pipe.rank({
        id: 0,
        flow: detected.flow,
        openedAt: detected.firedAt,
        openedMinute: detected.minute,
        onsetMinute: detected.onset ?? Math.max(injectMinute, detected.minute - 3),
        alerts: [detected],
        rca: null,
        ranks: [],
      });
    }
    if (detected && t >= impactUntil) break;
  }
  const rank = {} as Record<Method, number | null>;
  for (const m of METHODS) {
    const list = !rca ? null : m === "tracewise" ? rca.ranking.map((c) => c.node) : m in rca.baselines ? rca.baselines[m as keyof typeof rca.baselines] : rca.ablations[m as keyof typeof rca.ablations];
    const i = list ? list.indexOf(job.service) : -1;
    rank[m] = list ? (i >= 0 ? i + 1 : list.length + 1) : null;
  }
  return {
    kind: "fault",
    id: job.id,
    service: job.service,
    fault: job.fault,
    magnitude: job.magnitude,
    startHour: job.startHour,
    detectMin: detected ? (detected.firedAt - job.injectAt) / MINUTE_MS : null,
    firstAlert: detected?.kind ?? null,
    alertFlow: detected?.flow ?? null,
    rank,
    top3: rca ? rca.ranking.slice(0, 3).map((c) => c.node) : [],
    others: rca ? rca.ranking.filter((c) => c.node !== job.service && c.anomaly >= 0.5).length : 0,
    preAlerts,
    preHours: (job.injectAt - warmMs) / 3_600_000,
    impact: impact(pipe.history, injectMinute, pipe.opts.minLatencyRatio, pipe.opts.minErrorDelta),
    ...samplingStats(pipe),
    seconds: (performance.now() - t0) / 1000,
  };
}

function samplingStats(pipe: Pipeline) {
  return {
    spans: pipe.spansIn,
    traces: pipe.sampler.seen,
    kept: pipe.sampler.kept,
    byReason: { ...pipe.sampler.byReason },
    errorTraces: pipe.errorTraces,
    errorKept: pipe.errorKept,
  };
}

/**
 * How visible the fault was to users in the first minutes: the largest p95
 * ratio and error-ratio increase on any flow, against the half hour before.
 * "Visible" uses the same yardsticks as the alert thresholds.
 */
function impact(history: MinuteSummary[], injectMinute: number, minRatio: number, minErr: number) {
  const before = history.filter((h) => h.minute >= injectMinute - 30 && h.minute < injectMinute);
  const after = history.filter((h) => h.minute > injectMinute && h.minute <= injectMinute + IMPACT_MIN);
  let p95Ratio = 1;
  let errDelta = 0;
  for (const flow of Object.keys(after[0]?.flows ?? {})) {
    const b = before.map((h) => h.flows[flow]).filter((f) => f && f.n >= 5);
    const a = after.map((h) => h.flows[flow]).filter((f) => f && f.n >= 5);
    if (b.length < 10 || !a.length) continue;
    const med = (xs: number[]) => [...xs].sort((x, y) => x - y)[Math.floor((xs.length - 1) / 2)];
    p95Ratio = Math.max(p95Ratio, med(a.map((f) => f.p95)) / med(b.map((f) => f.p95)));
    const rate = (fs: typeof a) => fs.reduce((s, f) => s + f.err, 0) / Math.max(1, fs.reduce((s, f) => s + f.n, 0));
    errDelta = Math.max(errDelta, rate(a) - rate(b));
  }
  return { p95Ratio, errDelta, visible: p95Ratio >= minRatio || errDelta >= minErr };
}

function sketchErrors(history: MinuteSummary[], exact: Map<string, number[]>) {
  const out = { p50: [] as number[], p95: [] as number[], p99: [] as number[] };
  for (const h of history)
    for (const [flow, f] of Object.entries(h.flows)) {
      const xs = exact.get(`${h.minute}|${flow}`);
      if (!xs || xs.length < 50 || xs.length !== f.n) continue;
      const sorted = Float64Array.from(xs).sort();
      for (const [q, k] of [
        [0.5, "p50"],
        [0.95, "p95"],
        [0.99, "p99"],
      ] as const) {
        const e = exactQuantile(sorted, q);
        out[k].push(Math.abs(f[k] - e) / e);
      }
    }
  return out;
}
