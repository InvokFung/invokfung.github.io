/**
 * Runs the test suite and the accuracy/speed measurements, then writes
 * src/generated/metrics.json (shown on the landing page) and prints the
 * Markdown tables used in the README. Every number the app shows about
 * itself comes from here.
 *
 *   npm run metrics
 */
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";
import { CASES, noiseFalsePositives, pipelineAccuracy, runSweep, timePerFrame, vibratoAccuracy } from "../tests/accuracy";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- tests
const files = readdirSync(join(ROOT, "tests"))
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => join("tests", f));
const run = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-reporter=tap", ...files], { cwd: ROOT, encoding: "utf8" });
const count = (k: string) => Number(run.stdout.match(new RegExp(`^# ${k} (\\d+)`, "m"))?.[1] ?? NaN);
const tests = { total: count("tests"), passed: count("pass"), failed: count("fail") };
if (tests.failed !== 0 || !Number.isFinite(tests.total)) {
  console.error(run.stdout.slice(-4000), run.stderr.slice(-2000));
  throw new Error("Tests failed; not writing metrics.");
}

// ---------------------------------------------------------------- accuracy
const round = (x: number, d = 3) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);
const pick = (r: ReturnType<typeof runSweep>) => ({ n: r.n, missed: r.missed, gross: r.gross, median: round(r.median), p95: round(r.p95), max: round(r.max) });
const sweeps = CASES.map((c) => ({ id: c.id, label: c.label, mpm: pick(runSweep(c, "mpm")), yin: pick(runSweep(c, "yin")) }));
const vib = vibratoAccuracy();
const noise = noiseFalsePositives();
const pipe = pipelineAccuracy();
const timing = (["violin", "piano"] as const).map((p) => {
  const m = timePerFrame("mpm", p);
  const y = timePerFrame("yin", p);
  return { profile: p, window: m.window, mpmUs: round(m.us, 1), yinUs: round(y.us, 1), mpmBestUs: round(m.best, 1), yinBestUs: round(y.best, 1) };
});

const metrics = {
  generatedAt: new Date().toISOString(),
  environment: `Node ${process.version}, ${cpus()[0]?.model.trim() ?? "unknown CPU"}`,
  sampleRates: [44100, 48000],
  tests,
  sweeps,
  vibrato: { frames: vib.n, median: round(vib.median), p95: round(vib.p95), max: round(vib.max) },
  noise,
  pipeline: {
    drill: "D major scale, 2 octaves (29 notes), synthesized violin, programmed errors ±25¢",
    expected: pipe.expected,
    segments: pipe.segments,
    median: round(pipe.median, 2),
    max: round(pipe.max, 2),
  },
  timing,
  hopMs: round((512 / 48000) * 1000, 2),
};

writeFileSync(join(ROOT, "src", "generated", "metrics.json"), JSON.stringify(metrics, null, 2) + "\n");

// ---------------------------------------------------------------- report
const f = (x: number | null) => (x === null ? "–" : String(x));
console.log(`Tests: ${tests.passed}/${tests.total} passed\n`);
console.log("| Signal | MPM median / p95 / max (¢) | MPM missed · gross | YIN median / p95 / max (¢) | YIN missed · gross |");
console.log("| --- | --- | --- | --- | --- |");
for (const s of sweeps)
  console.log(`| ${s.label} (n=${s.mpm.n}) | ${f(s.mpm.median)} / ${f(s.mpm.p95)} / ${f(s.mpm.max)} | ${s.mpm.missed} · ${s.mpm.gross} | ${f(s.yin.median)} / ${f(s.yin.p95)} / ${f(s.yin.max)} | ${s.yin.missed} · ${s.yin.gross} |`);
console.log(`\nVibrato (A4, 5.5 Hz, ±20¢), error vs instantaneous pitch: median ${f(metrics.vibrato.median)}¢, p95 ${f(metrics.vibrato.p95)}¢, max ${f(metrics.vibrato.max)}¢ over ${vib.n} frames`);
console.log(`White noise called pitched: ${noise.pitched}/${noise.frames} frames`);
console.log(`Pipeline: ${pipe.segments}/${pipe.expected} notes segmented; |measured − programmed| median ${metrics.pipeline.median}¢, max ${metrics.pipeline.max}¢`);
console.log(`\n| Profile | Window | MPM µs/frame (median · best batch) | YIN µs/frame (median · best batch) |\n| --- | --- | --- | --- |`);
for (const t of timing) console.log(`| ${t.profile} | ${t.window} | ${t.mpmUs} · ${t.mpmBestUs} | ${t.yinUs} · ${t.yinBestUs} |`);
console.log(`\n${metrics.environment}`);
