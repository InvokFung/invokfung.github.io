// Builds the Atlas data from the rendered StudyLog in ../blog:
//   1. split every post into passages at its headings
//   2. BM25 inverted index over the passages
//   3. TF-IDF matrix -> randomized truncated SVD (latent semantic analysis)
//   4. pack everything into one binary index plus a JSON manifest
// Output goes to public/data/, which Vite copies into the built site.

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, HTMLElement, Node, TextNode } from "node-html-parser";
import { tokenize } from "../src/search/text";
import type { Chunk, Meta, Post, Section } from "../src/search/types";
import { randomizedSVD, type CSR } from "./linalg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLOG = join(ROOT, "..", "blog");
const OUT = join(ROOT, "public", "data");

const K = 96; // LSA dimensions
const LSA_VOCAB = 12000;
const MAX_CHARS = 1800; // passages longer than this are split into windows
const WINDOW = 1400;
const OVERLAP = 250;
const MIN_CHARS = 80;

// ---------------------------------------------------------------- 1. passages

const tStart = Date.now();

function findPosts(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...findPosts(p));
    else if (name === "index.html") out.push(p);
  }
  return out;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
/** Like clean, but keeps line breaks (tables, code, lists) for the reading panel. */
const cleanLines = (s: string) =>
  s
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n[\s]*/g, "\n")
    .trim();
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Rewrites rendered KaTeX as its plain MathML text (KaTeX ships each formula
 * three times: MathML, TeX source and HTML), and tables as one "cell · cell"
 * line per row.
 */
function flattenBlocks(article: HTMLElement) {
  for (const k of article.querySelectorAll(".katex")) {
    k.querySelectorAll("annotation").forEach((a) => a.remove());
    const math = k.querySelector(".katex-mathml")?.text ?? "";
    k.replaceWith(escapeHtml(math.replace(/\s+/g, " ").trim()));
  }
  for (const table of article.querySelectorAll("table")) {
    if (table.querySelector("td.code")) continue; // highlighted code block; keep its lines as they are
    const lines = table
      .querySelectorAll("tr")
      .map((tr) => tr.querySelectorAll("th,td").map((c) => clean(c.text)).join(" · "))
      .filter(Boolean);
    table.replaceWith(lines.map((l) => `<p>${escapeHtml(l)}</p>`).join(""));
  }
}

const BLOCK = new Set(["p", "div", "li", "ul", "ol", "pre", "blockquote", "tr", "table", "figure", "dl", "dt", "dd", "h4", "h5", "h6", "details", "summary", "hr"]);

/** Text of a node with a line break around each block element; whitespace inside <pre> is kept as is. */
function textOf(node: Node, inPre = false): string {
  if (node instanceof TextNode) return inPre ? node.text : node.text.replace(/\s+/g, " ");
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.tagName?.toLowerCase() ?? "";
  if (tag === "br") return "\n";
  const inner = node.childNodes.map((c) => textOf(c, inPre || tag === "pre")).join("");
  return BLOCK.has(tag) ? `\n${inner}\n` : inner;
}

interface RawSection {
  path: string[];
  anchor: string;
  text: string;
}

function sectionsOf(article: HTMLElement): RawSection[] {
  const sections: RawSection[] = [];
  const path: string[] = [];
  let cur: RawSection = { path: [], anchor: "", text: "" };
  const walk = (node: Node) => {
    if (node instanceof TextNode) {
      cur.text += textOf(node);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName?.toLowerCase();
    const level = tag && /^h[1-3]$/.test(tag) ? Number(tag[1]) : 0;
    if (level && node.id) {
      sections.push(cur);
      path.length = level - 1;
      path[level - 1] = clean(node.text);
      cur = { path: path.filter(Boolean), anchor: node.id, text: "" };
      return;
    }
    if (node.querySelector("h1[id],h2[id],h3[id]")) {
      node.childNodes.forEach(walk);
      return;
    }
    cur.text += textOf(node);
  };
  article.childNodes.forEach(walk);
  sections.push(cur);
  return sections.map((s) => ({ ...s, text: cleanLines(s.text) })).filter((s) => s.text.length >= MIN_CHARS);
}

function windows(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + WINDOW);
    if (end < text.length) {
      const cut = Math.max(text.lastIndexOf(" ", end), text.lastIndexOf("\n", end));
      if (cut > start + WINDOW / 2) end = cut;
    }
    out.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    let next = end - OVERLAP;
    const sp = text.slice(next).search(/\s/) + next;
    if (sp > 0 && sp < end) next = sp + 1;
    start = next;
  }
  // fold a short tail into the previous window
  if (out.length > 1 && out[out.length - 1].length < WINDOW / 3) {
    const tail = out.pop()!;
    out[out.length - 1] += " " + tail.slice(OVERLAP);
  }
  return out;
}

const posts: Post[] = [];
const chunks: Chunk[] = [];
const texts: string[][] = [];
const chunkTokens: string[][] = [];
const categoryIds = new Map<string, number>();

const files = findPosts(BLOG).filter((f) => /blog\/\d{4}\/\d{2}\/\d{2}\//.test(f));
const parsed = files.map((file) => {
  // Parse <pre> as markup too (the parser's default keeps it as raw text),
  // so highlighted code loses its line-number gutter and span tags.
  const root = parse(readFileSync(file, "utf8"), { blockTextElements: { script: true, noscript: true, style: true } });
  const title = clean(root.querySelector("h1.post-title")?.text ?? "");
  const time = root.querySelector("time.post-meta-date-created");
  const date = (time?.getAttribute("datetime") ?? time?.getAttribute("dateTime") ?? "").slice(0, 10);
  const cats = root.querySelectorAll("a.post-meta-categories").map((a) => clean(a.text));
  const tags = root.querySelectorAll("a.post-meta__tags").map((a) => clean(a.text));
  const article = root.querySelector("#article-container");
  article?.querySelectorAll(".gutter, script, style, .headerlink, .copy-notice").forEach((n) => n.remove());
  if (article) flattenBlocks(article);
  const url = "/" + file.slice(file.indexOf("blog/")).replace(/index\.html$/, "");
  return { title, date, cats, tags, url, article };
});
parsed.sort((a, b) => a.date.localeCompare(b.date) || a.url.localeCompare(b.url));

for (const p of parsed) {
  if (!p.article || !p.title) {
    console.warn("skipped (no article):", p.url);
    continue;
  }
  const cat = p.cats[p.cats.length - 1] ?? "Uncategorized";
  if (!categoryIds.has(cat)) categoryIds.set(cat, categoryIds.size);
  const postIdx = posts.length;
  const post: Post = { title: p.title, url: p.url, date: p.date, category: categoryIds.get(cat)!, tags: p.tags, first: chunks.length, count: 0 };
  const postTexts: string[] = [];
  for (const s of sectionsOf(p.article)) {
    for (const w of windows(s.text)) {
      const heading = s.path.join(" › ");
      chunks.push({ p: postIdx, h: heading, a: s.anchor, w: w.split(/\s+/).length });
      postTexts.push(w);
      // The post title and heading path ride along with every passage
      // ("contextual chunk headers"), so a passage deep in a post still
      // matches a query that names the post's subject.
      chunkTokens.push(tokenize(`${p.title} ${heading} ${heading} ${w}`));
      post.count++;
    }
  }
  if (!post.count) continue;
  posts.push(post);
  texts.push(postTexts);
}
const N = chunks.length;
const parseSeconds = (Date.now() - tStart) / 1000;
console.log(`posts ${posts.length}, passages ${N}, categories ${categoryIds.size}`);
if (N >= 65536) throw new Error("passage ids no longer fit in Uint16");

// ---------------------------------------------------------------- 2. BM25

let t0 = Date.now();

const termIds = new Map<string, number>();
const termCounts: Map<number, number>[] = chunkTokens.map((toks) => {
  const m = new Map<number, number>();
  for (const t of toks) {
    let id = termIds.get(t);
    if (id === undefined) termIds.set(t, (id = termIds.size));
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
});
const T = termIds.size;
const terms = [...termIds.keys()];
const df = new Uint32Array(T);
for (const m of termCounts) for (const t of m.keys()) df[t]++;
const offsets = new Uint32Array(T + 1);
for (let t = 0; t < T; t++) offsets[t + 1] = offsets[t] + df[t];
const docs = new Uint16Array(offsets[T]);
const tfs = new Uint8Array(offsets[T]);
const fill = offsets.slice(0, T);
termCounts.forEach((m, i) => {
  for (const [t, tf] of m) {
    docs[fill[t]] = i;
    tfs[fill[t]++] = Math.min(255, tf);
  }
});
const lens = Uint16Array.from(chunkTokens, (t) => Math.min(65535, t.length));
const avgLen = lens.reduce((a, b) => a + b, 0) / N;
const indexSeconds = (Date.now() - t0) / 1000;
console.log(`vocabulary ${T}, postings ${offsets[T]}, avg passage ${avgLen.toFixed(0)} tokens`);

// ---------------------------------------------------------------- 3. LSA

// Terms that appear in at least 3 passages but fewer than 30% of them,
// keeping the most widespread up to the vocabulary cap.
const lsaTerms = [...Array(T).keys()]
  .filter((t) => df[t] >= 3 && df[t] <= 0.3 * N)
  .sort((a, b) => df[b] - df[a])
  .slice(0, LSA_VOCAB);
const rows = new Array<number>(T).fill(-1);
lsaTerms.forEach((t, r) => (rows[t] = r));
const idf = lsaTerms.map((t) => Math.log(N / df[t]));

const ptr = new Uint32Array(N + 1);
const idx: number[] = [];
const val: number[] = [];
termCounts.forEach((m, i) => {
  const entries: [number, number][] = [];
  let norm = 0;
  for (const [t, tf] of m) {
    const r = rows[t];
    if (r < 0) continue;
    const w = (1 + Math.log(tf)) * idf[r];
    entries.push([r, w]);
    norm += w * w;
  }
  norm = Math.sqrt(norm) || 1;
  entries.sort((a, b) => a[0] - b[0]);
  for (const [r, w] of entries) {
    idx.push(r);
    val.push(w / norm);
  }
  ptr[i + 1] = idx.length;
});
const X: CSR = { rows: N, cols: lsaTerms.length, ptr, idx: Uint32Array.from(idx), val: Float64Array.from(val) };

t0 = Date.now();
const { V, sigma, XV } = randomizedSVD(X, K, { seed: 7 });
const explained = sigma.reduce((a, s) => a + s * s, 0) / N;
const svdSeconds = (Date.now() - t0) / 1000;
console.log(`SVD ${N}x${lsaTerms.length} -> k=${K} in ${svdSeconds.toFixed(1)}s, ${(explained * 100).toFixed(1)}% of variance`);

const C = new Int8Array(N * K);
for (let i = 0; i < N; i++) {
  let n = 0;
  for (let d = 0; d < K; d++) n += XV[i * K + d] ** 2;
  n = Math.sqrt(n) || 1;
  for (let d = 0; d < K; d++) C[i * K + d] = Math.round((XV[i * K + d] / n) * 127);
}
const Vq = new Int8Array(lsaTerms.length * K);
const vScale = new Float32Array(lsaTerms.length);
for (let r = 0; r < lsaTerms.length; r++) {
  let max = 0;
  for (let d = 0; d < K; d++) max = Math.max(max, Math.abs(V[r * K + d]));
  vScale[r] = max / 127 || 0;
  for (let d = 0; d < K; d++) Vq[r * K + d] = max ? Math.round((V[r * K + d] / max) * 127) : 0;
}

// ---------------------------------------------------------------- 4. write

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "text"), { recursive: true });

const arrays: [string, Section["type"], ArrayBufferView & { length: number }][] = [
  ["offsets", "u32", offsets],
  ["vScale", "f32", vScale],
  ["lens", "u16", lens],
  ["docs", "u16", docs],
  ["tfs", "u8", tfs],
  ["V", "i8", Vq],
  ["C", "i8", C],
];
const sections: Section[] = [];
const parts: Buffer[] = [];
let offset = 0;
for (const [name, type, arr] of arrays) {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) parts.push(Buffer.alloc(pad));
  offset += pad;
  const bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  sections.push({ name, type, offset, length: arr.length });
  parts.push(bytes);
  offset += bytes.length;
}
writeFileSync(join(OUT, "index.bin"), Buffer.concat(parts));

const meta: Meta = {
  builtAt: new Date().toISOString(),
  categories: [...categoryIds.keys()],
  posts,
  chunks,
  terms,
  bm25: { k1: 1.2, b: 0.75, avgLen },
  lsa: { k: K, rows, idf: idf.map((x) => Math.round(x * 1e4) / 1e4) },
  sections,
  stats: {
    vocabulary: T,
    lsaVocabulary: lsaTerms.length,
    postings: offsets[T],
    variance: explained,
    avgTokens: avgLen,
    indexBytes: offset,
    window: WINDOW,
    overlap: OVERLAP,
    parseSeconds,
    indexSeconds,
    svdSeconds,
  },
};
writeFileSync(join(OUT, "meta.json"), JSON.stringify(meta));
texts.forEach((t, i) => writeFileSync(join(OUT, "text", `${i}.json`), JSON.stringify(t)));
console.log(`wrote meta.json ${(JSON.stringify(meta).length / 1e6).toFixed(2)} MB, index.bin ${(offset / 1e6).toFixed(2)} MB`);
