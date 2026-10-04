// Writes the "Measured, not guessed" tables into README.md from the eval
// report, between <!-- eval:start --> and <!-- eval:end -->, so the README
// never disagrees with src/generated/eval.json.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Methods = Record<string, { top1: number; top3: number }>;

interface Report {
  config: { seed: number; faultScenarios: number; cleanRuns: number; cleanHours: number; spansSimulated: number };
  detection: { faults: number; detected: number; visible: number; visibleDetected: number; latencyMin: { median: number | null; p90: number | null } };
  rca: { n: number; methods: Methods; cascade: { n: number; methods: Methods }; byKind: Record<string, { n: number; visible: number; visibleDetected: number; latencyMedianMin: number | null; rca: Methods }> };
  falseAlarms: { simHours: number; alerts: number; perHour: number; preInjection: { simHours: number; alerts: number } };
  sketch: { windows: number; p50: { mean: number; max: number }; p95: { mean: number; max: number }; p99: { mean: number; max: number } };
  throughput: { ingestSpansPerSec: number; simSpansPerSec: number; endToEndSpansPerCpuSec: number };
  sampling: { clean: { retention: number; errorKept: number; errorTraces: number; errorRetention: number } };
}

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const fmt = (x: number) => Math.round(x).toLocaleString("en-US");
const NAMES: [string, string][] = [
  ["tracewise", "**Tracewise**"],
  ["p99Jump", "Biggest p99 jump"],
  ["alerting", "Service that alerted"],
  ["highestP99", "Highest p99"],
  ["anomalyOnly", "Ablation: anomaly only"],
  ["selfOnlyWalk", "Ablation: walk weighted by node anomaly"],
  ["noCriticalPath", "Ablation: no critical path"],
  ["pagerankOnly", "Ablation: walk only"],
];

export function readmeTables(r: Report): string {
  const d = r.detection;
  const s = r.sampling.clean;
  const sk = r.sketch;
  const lines = [
    `Seed ${r.config.seed} (held out; the method was developed on seed 1): ${r.config.faultScenarios} fault scenarios and ${r.config.cleanRuns} fault-free runs of ${r.config.cleanHours} simulated hours, ${fmt(r.config.spansSimulated)} spans.`,
    "",
    "| Measure | Result |",
    "| --- | --- |",
    `| Root cause ranked first / in top 3 | **${pct(r.rca.methods.tracewise.top1)}** / ${pct(r.rca.methods.tracewise.top3)} of ${r.rca.n} detected faults |`,
    `| Detection latency (simulated time) | median ${d.latencyMin.median} min, p90 ${d.latencyMin.p90} min |`,
    `| Faults detected | ${d.visibleDetected}/${d.visible} user-visible, ${d.detected}/${d.faults} overall |`,
    `| False alarms | ${r.falseAlarms.alerts} in ${fmt(r.falseAlarms.simHours)} fault-free hours (${r.falseAlarms.perHour}/h); ${r.falseAlarms.preInjection.alerts} in ${r.falseAlarms.preInjection.simHours} h before injections |`,
    `| Traces kept by the tail sampler | ${pct(s.retention)}, with ${pct(s.errorRetention, 0)} of error traces (${fmt(s.errorKept)}/${fmt(s.errorTraces)}) |`,
    `| DDSketch relative error, p50 / p95 / p99 | mean ${pct(sk.p50.mean)} / ${pct(sk.p95.mean)} / ${pct(sk.p99.mean)}, max ${pct(sk.p50.max)} / ${pct(sk.p95.max)} / ${pct(sk.p99.max)} over ${fmt(sk.windows)} flow-minutes |`,
    `| Ingest throughput, one thread | ${fmt(r.throughput.ingestSpansPerSec)} spans/s (simulator ${fmt(r.throughput.simSpansPerSec)} spans/s; end to end ${fmt(r.throughput.endToEndSpansPerCpuSec)} spans per CPU-second) |`,
    "",
    `| Ranking method | Top 1 | Top 3 | Top 1 on ${r.rca.cascade.n} cascades |`,
    "| --- | --- | --- | --- |",
    ...NAMES.map(([k, name]) => `| ${name} | ${pct(r.rca.methods[k].top1)} | ${pct(r.rca.methods[k].top3)} | ${pct(r.rca.cascade.methods[k].top1)} |`),
    "",
    "| Fault type | Runs | User-visible caught | Median detection | Tracewise top 1 | Biggest p99 jump top 1 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...Object.entries(r.rca.byKind).map(
      ([k, b]) => `| ${k} | ${b.n} | ${b.visibleDetected}/${b.visible} | ${b.latencyMedianMin ?? "–"} min | ${pct(b.rca.tracewise.top1)} | ${pct(b.rca.p99Jump.top1)} |`,
    ),
  ];
  return lines.join("\n");
}

export function updateReadme(path: string, report: unknown): boolean {
  if (!existsSync(path)) return false;
  const text = readFileSync(path, "utf8");
  const start = "<!-- eval:start -->";
  const end = "<!-- eval:end -->";
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i < 0 || j < i) return false;
  writeFileSync(path, `${text.slice(0, i + start.length)}\n${readmeTables(report as Report)}\n${text.slice(j)}`);
  return true;
}
