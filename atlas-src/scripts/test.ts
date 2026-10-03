// Engine checks: the bounded-heap top-k matches a full sort, the WebAssembly
// SIMD kernel and the JavaScript loop give bit-identical cosine scores, and
// how much faster the kernel is.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Engine, readIndex, timed, topK } from "../src/search/engine";
import { loadKernel } from "../src/search/kernel";
import type { Meta } from "../src/search/types";

// top-k against a stable full sort, with many ties and some non-positive scores
let seed = 1;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
for (let t = 0; t < 500; t++) {
  const n = 1 + Math.floor(rand() * 400);
  const scores = Float32Array.from({ length: n }, () => Math.round((rand() - 0.2) * 20) / 4);
  const limit = 1 + Math.floor(rand() * 60);
  const want = [...scores].map((score, chunk) => ({ chunk, score })).filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  const got = topK(scores, limit);
  if (got.length !== want.length || got.some((h, i) => h.chunk !== want[i].chunk || h.score !== want[i].score)) throw new Error(`top-k mismatch in case ${t}`);
}
console.log("top-k matches a full sort on 500 random cases");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "public", "data");
const meta: Meta = JSON.parse(readFileSync(join(DATA, "meta.json"), "utf8"));
const bin = readFileSync(join(DATA, "index.bin"));
const ix = readIndex(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const js = new Engine(meta, ix);
const simd = new Engine(meta, ix);
const kernel = await loadKernel(ix.C, meta.chunks.length, meta.lsa.k);
if (!kernel) throw new Error("WebAssembly SIMD unavailable");
simd.useKernel(kernel);

const questions: { q: string }[] = JSON.parse(readFileSync(join(ROOT, "eval", "questions.json"), "utf8"));
let checked = 0;
for (const { q } of questions) {
  const a = js.lsa(q, 5551);
  const b = simd.lsa(q, 5551);
  if (a.length !== b.length || a.some((h, i) => h.chunk !== b[i].chunk || h.score !== b[i].score)) throw new Error(`mismatch on "${q}"`);
  checked++;
}
// related() feeds passage vectors back in as queries, covering negative and dense inputs
for (let c = 0; c < meta.chunks.length; c += 97) {
  const a = js.related(c, 20);
  const b = simd.related(c, 20);
  if (a.some((h, i) => h.chunk !== b[i].chunk || h.score !== b[i].score)) throw new Error(`mismatch on passage ${c}`);
  checked++;
}
console.log(`identical scores on ${checked} queries`);

const q = "store user passwords safely";
for (let i = 0; i < 200; i++) js.lsa(q), simd.lsa(q);
const tj = timed(() => js.lsa(q), 300).ms;
const ts = timed(() => simd.lsa(q), 300).ms;
console.log(`LSA stage: JavaScript ${tj.toFixed(3)} ms, WebAssembly SIMD ${ts.toFixed(3)} ms (${(tj / ts).toFixed(1)}x)`);
