// Scores each search mode against eval/questions.json at the post level:
// a question is answered when one of its expected posts appears in the
// ranked list of distinct posts. Writes public/data/eval.json for the UI.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Engine, firstPerPost, readIndex, type Mode } from "../src/search/engine";
import type { Meta } from "../src/search/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "public", "data");
const meta: Meta = JSON.parse(readFileSync(join(DATA, "meta.json"), "utf8"));
const bin = readFileSync(join(DATA, "index.bin"));
const engine = new Engine(meta, readIndex(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
const questions: { q: string; expect: string[] }[] = JSON.parse(readFileSync(join(ROOT, "eval", "questions.json"), "utf8"));

const slug = (p: number) => meta.posts[p].url.split("/").filter(Boolean).pop()!;
for (const { expect } of questions)
  for (const e of expect) if (!meta.posts.some((_, i) => slug(i) === e)) throw new Error(`unknown post in eval set: ${e}`);

const modes: Mode[] = ["bm25", "lsa", "hybrid"];
const summary: Record<string, { hit1: number; hit5: number; mrr: number }> = {};
const perQuestion = questions.map(({ q, expect }) => ({ q, expect, rank: {} as Record<string, number | null> }));

for (const mode of modes) {
  let hit1 = 0;
  let hit5 = 0;
  let mrr = 0;
  questions.forEach(({ q, expect }, i) => {
    const posts = firstPerPost(meta, engine.search(q, mode, 100)).map((h) => slug(meta.chunks[h.chunk].p));
    const r = posts.findIndex((s) => expect.includes(s));
    perQuestion[i].rank[mode] = r < 0 ? null : r + 1;
    if (r === 0) hit1++;
    if (r >= 0 && r < 5) hit5++;
    if (r >= 0 && r < 10) mrr += 1 / (r + 1);
  });
  const n = questions.length;
  summary[mode] = { hit1: hit1 / n, hit5: hit5 / n, mrr: mrr / n };
}

const pct = (x: number) => (x * 100).toFixed(1).padStart(5) + "%";
console.log(`\n${questions.length} questions, post-level\n`);
console.log("mode     Hit@1   Hit@5   MRR@10");
for (const m of modes) console.log(`${m.padEnd(7)} ${pct(summary[m].hit1)}  ${pct(summary[m].hit5)}   ${summary[m].mrr.toFixed(3)}`);
const misses = perQuestion.filter((p) => p.rank.hybrid === null || p.rank.hybrid > 5);
if (misses.length) {
  console.log("\nhybrid misses (rank > 5):");
  for (const p of misses) console.log(`  [${p.rank.hybrid ?? "-"}] ${p.q}`);
}

writeFileSync(join(DATA, "eval.json"), JSON.stringify({ n: questions.length, summary, questions: perQuestion }));
