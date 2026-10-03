// Generates the three synthetic source files and their ground truth from the
// named seed, writes them to data/, and writes a small manifest (sizes and
// SHA-256 of every file) that the page imports. The browser regenerates the
// same files from the same seed and checks its hashes against this manifest.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CUSTOMERS, DEFAULT_SEED, generate } from "../src/gen/generate";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const GEN = join(ROOT, "src", "generated");
mkdirSync(DATA, { recursive: true });
mkdirSync(GEN, { recursive: true });

const t0 = performance.now();
const g = generate(DEFAULT_SEED, DEFAULT_CUSTOMERS);
const ms = performance.now() - t0;

const files = g.files.map((f) => {
  const bytes = Buffer.from(f.text, "utf8");
  writeFileSync(join(DATA, f.name), bytes);
  return { id: f.id, label: f.label, name: f.name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), rows: g.truth.entities[f.id].length };
});
writeFileSync(join(DATA, "truth.json"), JSON.stringify(g.truth));

const piiByType: Record<string, number> = {};
for (const s of g.truth.pii) piiByType[s.type] = (piiByType[s.type] ?? 0) + 1;
const records = files.reduce((a, f) => a + f.rows, 0);
const manifest = {
  seed: g.seed,
  customers: g.truth.customers,
  records,
  junkRecords: Object.values(g.truth.entities).flat().filter((e) => e.startsWith("junk")).length,
  files,
  piiSpans: g.truth.pii.length,
  piiByType,
  generateMs: Math.round(ms),
};
writeFileSync(join(GEN, "dataset.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`seed "${g.seed}": ${g.truth.customers} customers, ${records} records in ${Math.round(ms)} ms`);
for (const f of files) console.log(`  ${f.name.padEnd(26)} ${String(f.rows).padStart(6)} rows  ${(f.bytes / 1024).toFixed(0).padStart(5)} KB  ${f.sha256.slice(0, 12)}`);
console.log(`  ${g.truth.pii.length} PII spans injected: ${Object.entries(piiByType).map(([k, v]) => `${k} ${v}`).join(", ")}`);
