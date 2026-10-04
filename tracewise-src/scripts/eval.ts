// npm run eval: a seeded batch of chaos scenarios plus fault-free runs, run
// across worker threads, summarised into src/generated/eval.json, which the
// page imports. Every number on the page's "Measured" section comes from here.
//
//   --n 200        fault scenarios          --clean 12   fault-free runs
//   --hours 4      length of each clean run --seed 2026  base seed
//   --workers k    threads (default: CPUs)  --out path   output file
//
// Scenario seeds are fixed, and results are merged by scenario id, so the
// output does not depend on the number of workers (throughput aside).

import { writeFileSync, mkdirSync } from "node:fs";
import { availableParallelism, cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { simPipelineOptions } from "../src/core/config";
import { Pipeline } from "../src/core/pipeline";
import { Rng } from "../src/core/rng";
import { FAULT_KINDS, Simulator } from "../src/core/sim";
import { SERVICES, TRAFFIC } from "../src/core/topology";
import type { Span } from "../src/core/types";
import { updateReadme } from "./readme-table";
import { METHODS, WARMUP_MIN, WINDOW_MIN, drawFault, run, type CleanResult, type FaultResult, type Job, type Result } from "./scenario";

function arg(name: string, def: number): number;
function arg(name: string, def: string): string;
function arg(name: string, def: number | string): number | string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= process.argv.length) return def;
  return typeof def === "number" ? Number(process.argv[i + 1]) : process.argv[i + 1];
}

async function main() {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const n = arg("n", 200);
  const nClean = arg("clean", 12);
  const hours = arg("hours", 4);
  const seed = arg("seed", 2026);
  const workers = Math.max(1, arg("workers", availableParallelism()));
  const defaultOut = join(ROOT, "src", "generated", "eval.json");
  const out = arg("out", defaultOut);

  console.log(`throughput: measuring on the main thread`);
  const throughput = measureThroughput(seed);
  console.log(`  simulator ${fmtRate(throughput.simSpansPerSec)}, pipeline ingest ${fmtRate(throughput.ingestSpansPerSec)} over ${throughput.spans.toLocaleString("en-US")} spans`);

  const rng = new Rng(seed);
  const jobs: Job[] = [];
  for (let i = 0; i < nClean; i++) jobs.push({ kind: "clean", id: i, seed: seed * 1000 + 500 + i, startHour: rng.range(0, 24), hours, exact: true });
  for (let i = 0; i < n; i++) jobs.push(drawFault(rng, i, seed * 1000 + i));

  console.log(`running ${n} fault scenarios and ${nClean} x ${hours} h fault-free runs on ${workers} threads`);
  const t0 = performance.now();
  const results = await pool(jobs, workers);
  const wall = (performance.now() - t0) / 1000;
  const faults = results.filter((r): r is FaultResult => r.kind === "fault").sort((a, b) => a.id - b.id);
  const clean = results.filter((r): r is CleanResult => r.kind === "clean").sort((a, b) => a.id - b.id);
  const simSpans = results.reduce((s, r) => s + r.spans, 0);
  const cpuSeconds = results.reduce((s, r) => s + r.seconds, 0);

  const report = summarise(faults, clean, { seed, n, nClean, hours, workers, wall, simSpans, cpuSeconds, throughput });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
  const details = arg("details", "");
  if (details) writeFileSync(details, JSON.stringify({ faults, clean: clean.map(({ sketchErr: _, ...c }) => c) }, null, 1));
  print(report);
  console.log(`\nwrote ${out} (${(wall / 60).toFixed(1)} min wall, ${simSpans.toLocaleString("en-US")} spans simulated)`);
  // The README's tables are regenerated from the published report only.
  if (out === defaultOut && updateReadme(join(ROOT, "README.md"), report)) console.log("updated the tables in README.md");
}

function pool(jobs: Job[], k: number): Promise<Result[]> {
  return new Promise((resolve, reject) => {
    const results: Result[] = [];
    let next = 0;
    let done = 0;
    const url = new URL("./eval-worker.mjs", import.meta.url);
    const workers = Array.from({ length: Math.min(k, jobs.length) }, () => new Worker(url));
    const feed = (w: Worker) => {
      if (next < jobs.length) w.postMessage(jobs[next++]);
    };
    for (const w of workers) {
      w.on("message", (r: Result) => {
        results.push(r);
        done++;
        if (done % 20 === 0 || done === jobs.length) process.stdout.write(`  ${done}/${jobs.length}\n`);
        if (done === jobs.length) {
          for (const x of workers) x.terminate();
          resolve(results);
        } else feed(w);
      });
      w.on("error", reject);
      feed(w);
    }
  });
}

/** Spans per second for the simulator alone, and for the pipeline ingesting recorded spans. */
function measureThroughput(seed: number) {
  const spans: Span[] = [];
  const sim = new Simulator({ seed, startHour: 14, onSpan: (s) => spans.push(s) });
  const minutes = 30;
  const t0 = performance.now();
  sim.runUntil(minutes * 60_000);
  const simSec = (performance.now() - t0) / 1000;
  const runs: number[] = [];
  for (let r = 0; r < 4; r++) {
    const pipe = new Pipeline(simPipelineOptions());
    const t1 = performance.now();
    let nextTick = 1000;
    for (const s of spans) {
      const end = s.endNs / 1e6;
      if (end >= nextTick) {
        pipe.advance(nextTick);
        nextTick += 1000;
      }
      pipe.ingest(s);
    }
    pipe.advance(minutes * 60_000 + 10_000);
    runs.push(spans.length / ((performance.now() - t1) / 1000));
  }
  runs.sort((a, b) => a - b);
  return { spans: spans.length, simSpansPerSec: Math.round(spans.length / simSec), ingestSpansPerSec: Math.round((runs[1] + runs[2]) / 2) };
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r4 = (x: number | null) => (x === null ? null : Math.round(x * 1e4) / 1e4);
const r2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);

function summarise(faults: FaultResult[], clean: CleanResult[], meta: { seed: number; n: number; nClean: number; hours: number; workers: number; wall: number; simSpans: number; cpuSeconds: number; throughput: ReturnType<typeof measureThroughput> }) {
  const detected = faults.filter((f) => f.detectMin !== null);
  const visible = faults.filter((f) => f.impact.visible);
  const lat = detected.map((f) => f.detectMin!);
  const acc = (rs: FaultResult[], m: (typeof METHODS)[number]) => ({
    top1: r4(rs.length ? rs.filter((f) => f.rank[m] === 1).length / rs.length : null),
    top3: r4(rs.length ? rs.filter((f) => (f.rank[m] ?? 99) <= 3).length / rs.length : null),
  });
  const byKind = Object.fromEntries(
    FAULT_KINDS.map((k) => {
      const all = faults.filter((f) => f.fault === k);
      const det = all.filter((f) => f.detectMin !== null);
      const vis = all.filter((f) => f.impact.visible);
      return [
        k,
        {
          n: all.length,
          detected: det.length,
          visible: vis.length,
          visibleDetected: vis.filter((f) => f.detectMin !== null).length,
          latencyMedianMin: r2(quantile(det.map((f) => f.detectMin!), 0.5)),
          rca: Object.fromEntries(METHODS.map((m) => [m, acc(det, m)])),
        },
      ];
    }),
  );
  const firstAlert: Record<string, number> = {};
  for (const f of detected) firstAlert[f.firstAlert!] = (firstAlert[f.firstAlert!] ?? 0) + 1;

  const cleanAlerts = clean.reduce((s, c) => s + c.alerts, 0);
  const cleanHours = clean.reduce((s, c) => s + c.alertHours, 0);
  const preAlerts = faults.reduce((s, f) => s + f.preAlerts, 0);
  const preHours = faults.reduce((s, f) => s + f.preHours, 0);

  const sketch = { p50: [] as number[], p95: [] as number[], p99: [] as number[] };
  for (const c of clean) if (c.sketchErr) for (const k of ["p50", "p95", "p99"] as const) sketch[k].push(...c.sketchErr[k]);
  const sk = (xs: number[]) => ({ mean: r4(mean(xs)), p99: r4(quantile(xs, 0.99)), max: r4(xs.length ? Math.max(...xs) : null) });

  const sampling = (rs: (FaultResult | CleanResult)[]) => {
    const traces = rs.reduce((s, r) => s + r.traces, 0);
    const kept = rs.reduce((s, r) => s + r.kept, 0);
    const errorTraces = rs.reduce((s, r) => s + r.errorTraces, 0);
    const errorKept = rs.reduce((s, r) => s + r.errorKept, 0);
    const byReason: Record<string, number> = {};
    for (const r of rs) for (const [k, v] of Object.entries(r.byReason)) byReason[k] = (byReason[k] ?? 0) + v;
    return { traces, kept, retention: r4(kept / traces), byReason, errorTraces, errorKept, errorRetention: r4(errorTraces ? errorKept / errorTraces : 1) };
  };

  return {
    generatedAt: new Date().toISOString(),
    machine: { cpu: cpus()[0]?.model ?? "unknown", threads: meta.workers, node: process.version },
    config: {
      seed: meta.seed,
      faultScenarios: meta.n,
      cleanRuns: meta.nClean,
      cleanHours: meta.hours,
      warmupMin: WARMUP_MIN,
      windowMin: WINDOW_MIN,
      meanRps: TRAFFIC.meanRps,
      services: SERVICES.length,
      faultKinds: FAULT_KINDS,
      wallSeconds: Math.round(meta.wall),
      spansSimulated: meta.simSpans,
    },
    detection: {
      faults: faults.length,
      detected: detected.length,
      visible: visible.length,
      visibleDetected: visible.filter((f) => f.detectMin !== null).length,
      invisibleDetected: faults.filter((f) => !f.impact.visible && f.detectMin !== null).length,
      latencyMin: { median: r2(quantile(lat, 0.5)), p90: r2(quantile(lat, 0.9)), mean: r2(mean(lat)) },
      firstAlert,
    },
    rca: {
      n: detected.length,
      methods: Object.fromEntries(METHODS.map((m) => [m, acc(detected, m)])),
      byKind,
      // Faults where other services looked anomalous too: where propagation matters.
      cascade: (() => {
        const cs = detected.filter((f) => f.others > 0);
        return { n: cs.length, methods: Object.fromEntries(METHODS.map((m) => [m, acc(cs, m)])) };
      })(),
    },
    falseAlarms: {
      runs: clean.length,
      simHours: r2(cleanHours),
      alerts: cleanAlerts,
      perHour: r4(cleanAlerts / cleanHours),
      incidents: clean.reduce((s, c) => s + c.incidents, 0),
      preInjection: { simHours: r2(preHours), alerts: preAlerts, perHour: r4(preAlerts / preHours) },
    },
    sketch: { alpha: 0.01, windows: sketch.p50.length, p50: sk(sketch.p50), p95: sk(sketch.p95), p99: sk(sketch.p99) },
    throughput: {
      ingestSpansPerSec: meta.throughput.ingestSpansPerSec,
      simSpansPerSec: meta.throughput.simSpansPerSec,
      measuredOn: meta.throughput.spans,
      endToEndSpansPerCpuSec: Math.round(meta.simSpans / meta.cpuSeconds),
    },
    sampling: { clean: sampling(clean), all: sampling([...clean, ...faults]) },
    // Compact per-scenario rows for the page: kind, service, magnitude, minutes to detect, rank (Tracewise), rank (p99 jump), visible.
    scenarios: faults.map((f) => [FAULT_KINDS.indexOf(f.fault), SERVICES.findIndex((s) => s.id === f.service), Number(f.magnitude.toPrecision(3)), f.detectMin === null ? null : r2(f.detectMin), f.rank.tracewise, f.rank.p99Jump, f.impact.visible ? 1 : 0]),
  };
}

function fmtRate(x: number) {
  return `${(x / 1e6).toFixed(2)}M spans/s`;
}

function print(r: ReturnType<typeof summarise>) {
  const pct = (x: number | null) => (x === null ? "  -  " : `${(x * 100).toFixed(1).padStart(5)}%`);
  const d = r.detection;
  console.log(`\ndetected ${d.detected}/${d.faults} faults; ${d.visibleDetected}/${d.visible} of those visible to users (${d.invisibleDetected} detected while below the visibility bar)`);
  console.log(`detection latency: median ${d.latencyMin.median} min, p90 ${d.latencyMin.p90} min (sim time); first alert: ${JSON.stringify(d.firstAlert)}`);
  console.log(`\nroot cause over ${r.rca.n} detected faults     top-1   top-3`);
  for (const [m, a] of Object.entries(r.rca.methods)) console.log(`  ${m.padEnd(30)} ${pct(a.top1)}  ${pct(a.top3)}`);
  console.log(`\ncascades: ${r.rca.cascade.n} detected faults where other services also looked anomalous`);
  for (const [m, a] of Object.entries(r.rca.cascade.methods)) console.log(`  ${m.padEnd(30)} ${pct(a.top1)}  ${pct(a.top3)}`);
  console.log(`\nby fault kind           n  det  vis  vis-det  med-min  tracewise top1/top3   p99Jump top1   alerting top1`);
  for (const [k, v] of Object.entries(r.rca.byKind))
    console.log(`  ${k.padEnd(10)} ${String(v.n).padStart(10)} ${String(v.detected).padStart(4)} ${String(v.visible).padStart(4)} ${String(v.visibleDetected).padStart(8)} ${String(v.latencyMedianMin).padStart(8)}   ${pct(v.rca.tracewise.top1)} / ${pct(v.rca.tracewise.top3)}      ${pct(v.rca.p99Jump.top1)}         ${pct(v.rca.alerting.top1)}`);
  const fa = r.falseAlarms;
  console.log(`\nfalse alarms: ${fa.alerts} in ${fa.simHours} fault-free sim-hours = ${fa.perHour}/h; before injection: ${fa.preInjection.alerts} in ${fa.preInjection.simHours} h = ${fa.preInjection.perHour}/h`);
  console.log(`sketch relative error over ${r.sketch.windows} flow-minutes: p50 mean ${pct(r.sketch.p50.mean)} max ${pct(r.sketch.p50.max)}; p95 mean ${pct(r.sketch.p95.mean)} max ${pct(r.sketch.p95.max)}; p99 mean ${pct(r.sketch.p99.mean)} max ${pct(r.sketch.p99.max)}`);
  const s = r.sampling.clean;
  console.log(`sampling (fault-free): kept ${s.kept}/${s.traces} = ${pct(s.retention)} ${JSON.stringify(s.byReason)}; error traces kept ${s.errorKept}/${s.errorTraces} = ${pct(s.errorRetention)}`);
  const sa = r.sampling.all;
  console.log(`sampling (all runs):   kept ${pct(sa.retention)}; error traces kept ${sa.errorKept}/${sa.errorTraces} = ${pct(sa.errorRetention)}`);
  console.log(`throughput: ingest ${fmtRate(r.throughput.ingestSpansPerSec)}, simulator ${fmtRate(r.throughput.simSpansPerSec)}, end to end ${fmtRate(r.throughput.endToEndSpansPerCpuSec)} per CPU-second`);
}

if (!isMainThread) {
  parentPort!.on("message", (job: Job) => parentPort!.postMessage(run(job)));
} else {
  await main();
}
