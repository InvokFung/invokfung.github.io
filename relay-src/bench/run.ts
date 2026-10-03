// npm run bench → src/data/bench.json, which the page imports. Every number on
// the page comes from this file.

import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { benchCanary } from "./canary";
import { INJECTION_HELDOUT, PII_HELDOUT } from "./data/heldout";
import { INJECTION_SAMPLES } from "./data/injection";
import { PII_SAMPLES } from "./data/pii";
import { benchOverhead } from "./overhead";
import { benchCache, benchInjection, benchRedaction } from "./quality";
import { updateReadme } from "./readme";
import { benchHedging, benchResilience } from "./resilience";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "src", "data", "bench.json");

async function step<T>(name: string, f: () => T | Promise<T>): Promise<T> {
  const t0 = performance.now();
  const r = await f();
  console.log(`  ${name.padEnd(12)} ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  return r;
}

console.log("relay bench");
const overhead = await step("overhead", () => benchOverhead());
const resilience = await step("resilience", () => benchResilience());
const hedging = await step("hedging", () => benchHedging());
const cache = await step("cache", () => benchCache());
const redaction = await step("redaction", () => benchRedaction(PII_SAMPLES));
const redactionHeldout = await step("  held out", () => benchRedaction(PII_HELDOUT));
const injection = await step("injection", () => benchInjection(INJECTION_SAMPLES));
const injectionHeldout = await step("  held out", () => benchInjection(INJECTION_HELDOUT));
const canary = await step("canary", () => benchCanary());

const result = {
  generatedAt: new Date().toISOString(),
  env: { node: process.version, platform: `${process.platform}-${process.arch}`, cpu: cpus()[0]?.model.replace(/\s+/g, " ").trim() ?? "unknown" },
  overhead,
  resilience,
  hedging,
  cache,
  redaction,
  redactionHeldout,
  injection,
  injectionHeldout,
  canary,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");

// A readable summary on the console.
const o = overhead;
console.log(`\noverhead (zero-latency upstream, ${o.requests} requests): gateway p50 ${o.gateway.p50} µs, p99 ${o.gateway.p99} µs`);
console.log(`  cache misses (${o.miss.n}): p50 ${o.miss.p50} µs, p99 ${o.miss.p99} µs; cache hits (${o.hit.n}): p50 ${o.hit.p50} µs, p99 ${o.hit.p99} µs`);
for (const [s, v] of Object.entries(o.miss.stages)) console.log(`  ${s.padEnd(11)} p50 ${String(v.p50).padStart(6)} µs   p99 ${String(v.p99).padStart(7)} µs`);
for (const sc of resilience) {
  console.log(`\n${sc.label}`);
  for (const c of sc.configs) console.log(`  ${c.label.padEnd(34)} success ${String(c.success).padStart(6)}%   p50 ${c.p50Ms} ms   p99 ${c.p99Ms} ms   attempts/req ${c.attemptsPerRequest}`);
}
console.log(`\nhedging: TTFB p99 ${hedging.without.ttfbP99} ms → ${hedging.with.ttfbP99} ms; hedged ${hedging.hedgedShare}% of requests, +${hedging.extraCalls}% upstream calls`);
console.log(`\ncache (${cache.requests} requests, ${cache.verbatimShare}% verbatim repeats, ceiling ${cache.ceiling}%):`);
for (const v of cache.variants) console.log(`  ${v.label.padEnd(48)} hits ${v.hitRate}% (exact ${v.exactRate}, near ${v.nearRate})   false hits ${v.falseHitRate}%   lookup ${v.lookupUsP50} µs`);
console.log(`\nredaction (${redaction.samples} samples):`);
for (const r of [...redaction.perType, redaction.overall]) console.log(`  ${r.type.padEnd(6)} precision ${r.precision}%   recall ${r.recall}%   (${r.gold} gold, ${r.predicted} predicted)`);
console.log(`  misses: ${redaction.misses.join(" | ")}`);
console.log(`  false positives: ${redaction.falsePositives.join(" | ")}`);
console.log(`  held out (${redactionHeldout.samples} samples): precision ${redactionHeldout.overall.precision}%, recall ${redactionHeldout.overall.recall}%`);
for (const r of redactionHeldout.perType) console.log(`    ${r.type.padEnd(6)} precision ${r.precision}%   recall ${r.recall}%   (${r.gold} gold, ${r.predicted} predicted)`);
console.log(`    misses: ${redactionHeldout.misses.join(" | ")}`);
console.log(`    false positives: ${redactionHeldout.falsePositives.join(" | ")}`);
console.log(`\ninjection screen (${injection.benign} benign, ${injection.attacks} attacks):`);
console.log(`  flag ≥ ${injection.flag.threshold}: precision ${injection.flag.precision}%, recall ${injection.flag.recall}%, false positives ${injection.flag.falsePositiveRate}%`);
console.log(`  block ≥ ${injection.block.threshold}: precision ${injection.block.precision}%, recall ${injection.block.recall}%, false positives ${injection.block.falsePositiveRate}%`);
for (const c of injection.byCategory) console.log(`  ${(c.attack ? "attack " : "benign ") + c.category.padEnd(20)} ${c.flagged}/${c.n} flagged, ${c.blocked}/${c.n} blocked`);
console.log(`  missed: ${injection.missedExamples.length}; false positives: ${injection.falsePositiveExamples.join(" | ")}`);
console.log(
  `  held out (${injectionHeldout.benign} benign, ${injectionHeldout.attacks} attacks): flag precision ${injectionHeldout.flag.precision}%, recall ${injectionHeldout.flag.recall}%, false positives ${injectionHeldout.flag.falsePositiveRate}%; block recall ${injectionHeldout.block.recall}%`,
);
console.log(`    missed: ${injectionHeldout.missedExamples.join(" | ")}`);
console.log(`    false positives: ${injectionHeldout.falsePositiveExamples.join(" | ")}`);
console.log("\ncanary:");
for (const c of canary) console.log(`  ${c.version} ${c.status.padEnd(12)} after ${c.decidedAfterS} s, ${c.canaryRequests} canary requests. ${c.reason ?? ""}`);
console.log(`\nwrote ${out}`);
const readme = join(here, "..", "README.md");
console.log(updateReadme(readme, result) ? `updated the tables in ${readme}` : `README.md has no bench markers; left it alone`);
