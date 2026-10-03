// Runs the whole pipeline in Node on the files `npm run data` wrote, scores
// every stage against the generator's truth, and writes
// src/generated/eval.json for the page and the README's results table.
// Nothing on the page that claims a measurement is typed by hand.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clusterize, resolve, VETO } from "../src/core/er";
import { pairsCompleteness } from "../src/core/evaluate";
import { HyperLogLog } from "../src/core/hll";
import { Session, STAGES, type StageKey } from "../src/core/pipeline";
import { emailBaseline, entityLabels, liveScore, mappingScore, oracleDecisions, piiScore, scoreLabels } from "../src/core/score";
import type { SourceFile } from "../src/core/types";
import { generate, type Truth } from "../src/gen/generate";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const manifest = JSON.parse(readFileSync(join(ROOT, "src", "generated", "dataset.json"), "utf8"));
const truth: Truth = JSON.parse(readFileSync(join(DATA, "truth.json"), "utf8"));
const files: SourceFile[] = manifest.files.map((f: { id: string; label: string; name: string }) => ({ id: f.id, label: f.label, name: f.name, text: readFileSync(join(DATA, f.name), "utf8") }));

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
const prf = (x: { precision: number; recall: number; f1: number }) => ({ precision: round(x.precision), recall: round(x.recall), f1: round(x.f1) });

// ---------------------------------------------------------------- throughput
console.log(`seed "${manifest.seed}": ${manifest.records} records in ${files.length} files`);
await Session.run(files); // warm the JIT once
const RUNS = 5;
const runs: { total: number; stages: Partial<Record<StageKey, number>>; resolve: Session["resolveTimings"] }[] = [];
let s!: Session;
for (let i = 0; i < RUNS; i++) {
  const t0 = performance.now();
  s = await Session.run(files);
  runs.push({ total: performance.now() - t0, stages: { ...s.timings }, resolve: { ...s.resolveTimings } });
}
const medianTotal = median(runs.map((r) => r.total));
const stages = Object.fromEntries(STAGES.map((st) => [st.key, round(median(runs.map((r) => r.stages[st.key] ?? 0)), 1)]));
const resolveParts = Object.fromEntries(Object.keys(runs[0].resolve).map((k) => [k, round(median(runs.map((r) => r.resolve[k as keyof Session["resolveTimings"]])), 1)]));
console.log(`pipeline: median ${medianTotal.toFixed(0)} ms over ${RUNS} runs, ${Math.round(s.recs.length / (medianTotal / 1000)).toLocaleString("en-US")} records/s`);

// ---------------------------------------------------------------- entity resolution
const labels = entityLabels(s, truth);
const trueEntities = new Set(Array.from(labels)).size;
const plain = resolve(s.recs, { skip: s.excluded, tf: false });
const plainClusters = clusterize(s.recs.length, plain.pairs, s.thresholds, new Map(), s.excluded, { guards: false });
const tfOnly = clusterize(s.recs.length, s.er.pairs, s.thresholds, new Map(), s.excluded, { guards: false });
const oracle = clusterize(s.recs.length, s.er.pairs, s.thresholds, oracleDecisions(s, labels), s.excluded);
const live = liveScore(s, labels);
const methods = [
  { key: "email-raw", label: "Exact email, as exported", ...scoreLabels(emailBaseline(s, "raw"), labels) },
  { key: "email-canonical", label: "Exact email, normalized", ...scoreLabels(emailBaseline(s, "canonical"), labels) },
  { key: "fs-plain", label: "Fellegi-Sunter (EM)", ...scoreLabels(plainClusters.labels, labels) },
  { key: "fs-tf", label: "+ term-frequency weights", ...scoreLabels(tfOnly.labels, labels) },
  { key: "onboard", label: "+ guard rules (Onboard)", ...scoreLabels(s.clustering.labels, labels) },
  { key: "reviewed", label: "+ review queue resolved", ...scoreLabels(oracle.labels, labels) },
].map((m) => ({ key: m.key, label: m.label, pairwise: prf(m.pairwise), bcubed: prf(m.bcubed), clusters: m.clusters }));
for (const m of methods) console.log(`  ${m.label.padEnd(28)} pairwise F1 ${m.pairwise.f1.toFixed(3)}  B³ F1 ${m.bcubed.f1.toFixed(3)}  clusters ${m.clusters}`);

const pc = pairsCompleteness(s.er.pairs.a, s.er.pairs.b, labels);
let vetoed = 0;
for (let p = 0; p < s.er.pairs.veto.length; p++) if (s.er.pairs.veto[p]) vetoed++;
const model = s.er.model;

// ---------------------------------------------------------------- mapping, PII, HLL, contracts
const mapping = mappingScore(s, truth);
const piiV = piiScore(s, truth, true);
const piiR = piiScore(s, truth, false);
console.log(`mapping ${(mapping.accuracy * 100).toFixed(1)}% · PII P ${piiV.overall.precision.toFixed(3)} R ${piiV.overall.recall.toFixed(3)} (regex only P ${piiR.overall.precision.toFixed(3)})`);

const hllCols = [...s.profiles.entries()].flatMap(([source, ps]) => ps.filter((p) => p.distinct > 0).map((p) => ({ source, column: p.name, exact: p.distinct, hll: p.distinctHll, error: p.hllError })));
const absErr = hllCols.map((c) => Math.abs(c.error));
// HLL at scale too: the profile columns top out near 10k distinct values, where linear counting does the work
const scale = [1e4, 1e5, 1e6].map((n) => {
  const h = new HyperLogLog(12);
  for (let i = 0; i < n; i++) h.add(`customer-${i}`);
  return { n, estimate: h.count(), error: round((h.count() - n) / n) };
});

const junkTotal = Object.values(truth.entities).flat().filter((e) => e.startsWith("junk")).length;
let junkCaught = 0;
for (const i of s.quarantine.keys()) if ((truth.entities[s.recs[i].source]?.[s.recs[i].row] ?? "").startsWith("junk")) junkCaught++;

// ---------------------------------------------------------------- other seeds
const SEEDS = ["week-one", "harbour-lights", "quarter-close", "go-live", "cutover"];
const seeds: { seed: string; records: number; pairwiseF1: number; bcubedF1: number; baselinePairwiseF1: number; mapping: number; piiF1: number }[] = [];
for (const seed of SEEDS) {
  const g = generate(seed);
  const ss = await Session.run(g.files);
  const lb = entityLabels(ss, g.truth);
  const sc = scoreLabels(ss.clustering.labels, lb);
  const base = scoreLabels(emailBaseline(ss, "raw"), lb);
  seeds.push({
    seed,
    records: ss.recs.length,
    pairwiseF1: round(sc.pairwise.f1),
    bcubedF1: round(sc.bcubed.f1),
    baselinePairwiseF1: round(base.pairwise.f1),
    mapping: round(mappingScore(ss, g.truth).accuracy),
    piiF1: round(piiScore(ss, g.truth, true).overall.f1),
  });
  console.log(`  seed ${seed.padEnd(15)} pairwise F1 ${sc.pairwise.f1.toFixed(3)}  B³ F1 ${sc.bcubed.f1.toFixed(3)}`);
}
const spread = (k: "pairwiseF1" | "bcubedF1" | "mapping" | "piiF1" | "baselinePairwiseF1") => {
  const xs = seeds.map((x) => x[k]);
  return { mean: round(xs.reduce((a, b) => a + b, 0) / xs.length), min: Math.min(...xs), max: Math.max(...xs) };
};

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  seed: manifest.seed,
  customers: manifest.customers,
  records: s.recs.length,
  trueEntities,
  er: {
    methods,
    thresholds: s.thresholds,
    review: { size: live.review.size, trueMatches: live.review.trueMatches },
    autoMatched: s.clustering.autoMatched,
    blockedMerges: s.clustering.blocked,
    vetoed,
    tfAdjusted: s.er.tfAdjusted,
    blocking: {
      candidates: s.er.blocking.candidates,
      totalPairs: s.er.blocking.totalPairs,
      reductionRatio: s.er.blocking.reductionRatio,
      pairsCompleteness: round(pc.completeness),
      truePairs: pc.total,
      truePairsFound: pc.found,
      rules: s.er.blocking.rules,
    },
    em: {
      iterations: model.iterations,
      converged: model.converged,
      patterns: model.patterns,
      uSample: model.uSample,
      blockedLambda: round(model.blockedLambda),
      prior: round(model.prior, 2),
      comparators: model.comparators.map((c, k) => ({ key: c.key, label: c.label, levels: c.levels.map((l, i) => ({ level: l, m: round(model.params.m[k][i]), u: round(model.params.u[k][i], 6), weight: round(model.weights[k][i], 2) })) })),
    },
  },
  mapping: { accuracy: round(mapping.accuracy), correct: mapping.correct, total: mapping.total, wrong: mapping.wrong },
  pii: {
    injected: truth.pii.length,
    validated: { overall: prf(piiV.overall), byType: Object.fromEntries(Object.entries(piiV.byType).map(([k, v]) => [k, { ...prf(v), tp: v.tp, fp: v.fp, fn: v.fn }])) },
    regexOnly: { overall: prf(piiR.overall), byType: Object.fromEntries(Object.entries(piiR.byType).map(([k, v]) => [k, { ...prf(v), tp: v.tp, fp: v.fp, fn: v.fn }])) },
  },
  hll: {
    precision: 12,
    standardError: round(1.04 / Math.sqrt(4096)),
    columns: hllCols.length,
    meanAbsError: round(absErr.reduce((a, b) => a + b, 0) / absErr.length),
    maxAbsError: round(Math.max(...absErr)),
    scale,
  },
  normalize: s.norm,
  contracts: { quarantined: s.quarantine.size, junkTotal, junkCaught, rules: [...s.recordContracts, ...s.clusterContracts, ...s.goldenContracts].map((r) => ({ id: r.id, checked: r.checked, failed: r.failed })) },
  golden: { records: s.golden.length, multiSource: s.golden.filter((g) => g.sources.length > 1).length },
  throughput: { runs: RUNS, medianMs: round(medianTotal, 1), recordsPerSecond: Math.round(s.recs.length / (medianTotal / 1000)), stages, resolve: resolveParts },
  seeds,
  seedSummary: { pairwiseF1: spread("pairwiseF1"), bcubedF1: spread("bcubedF1"), baselinePairwiseF1: spread("baselinePairwiseF1"), mapping: spread("mapping"), piiF1: spread("piiF1") },
};
writeFileSync(join(ROOT, "src", "generated", "eval.json"), JSON.stringify(report, null, 1) + "\n");

// ---------------------------------------------------------------- README table
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const byKey = Object.fromEntries(methods.map((m) => [m.key, m]));
const rows = [
  "| Measure | Result |",
  "| --- | --- |",
  `| Entity resolution, pairwise F1 (precision / recall) | **${byKey.onboard.pairwise.f1.toFixed(3)}** (${pct(byKey.onboard.pairwise.precision)} / ${pct(byKey.onboard.pairwise.recall)}) |`,
  `| Entity resolution, B-cubed F1 (precision / recall) | **${byKey.onboard.bcubed.f1.toFixed(3)}** (${pct(byKey.onboard.bcubed.precision)} / ${pct(byKey.onboard.bcubed.recall)}) |`,
  `| Naive baseline (exact email as exported), pairwise F1 | ${byKey["email-raw"].pairwise.f1.toFixed(3)} |`,
  `| Same, after resolving the ${live.review.size} review-queue pairs correctly | pairwise F1 ${byKey.reviewed.pairwise.f1.toFixed(3)} |`,
  `| Pairwise F1 across ${seeds.length} seeds (mean, min–max) | ${report.seedSummary.pairwiseF1.mean.toFixed(3)} (${report.seedSummary.pairwiseF1.min.toFixed(3)}–${report.seedSummary.pairwiseF1.max.toFixed(3)}) |`,
  `| Blocking: reduction ratio / pairs completeness | ${(s.er.blocking.reductionRatio * 100).toFixed(2)}% / ${pct(pc.completeness)} |`,
  `| Schema mapping accuracy | ${pct(mapping.accuracy)} (${mapping.correct} of ${mapping.total} columns) |`,
  `| PII detection, precision / recall | ${pct(piiV.overall.precision)} / ${pct(piiV.overall.recall)} (regex only: ${pct(piiR.overall.precision)} / ${pct(piiR.overall.recall)}) |`,
  `| HyperLogLog distinct-count error, mean / max over ${hllCols.length} columns | ${pct(report.hll.meanAbsError)} / ${pct(report.hll.maxAbsError)} |`,
  `| Throughput (Node ${process.version}, median of ${RUNS}) | ${report.throughput.recordsPerSecond.toLocaleString("en-US")} records/s (${Math.round(medianTotal).toLocaleString("en-US")} ms for ${s.recs.length.toLocaleString("en-US")}) |`,
];
const readmePath = join(ROOT, "README.md");
try {
  const readme = readFileSync(readmePath, "utf8");
  const start = "<!-- eval:start -->";
  const end = "<!-- eval:end -->";
  if (readme.includes(start) && readme.includes(end)) {
    const next = readme.slice(0, readme.indexOf(start) + start.length) + "\n" + rows.join("\n") + "\n" + readme.slice(readme.indexOf(end));
    writeFileSync(readmePath, next);
  }
} catch {
  // no README yet
}
console.log("\n" + rows.join("\n"));
void VETO;
