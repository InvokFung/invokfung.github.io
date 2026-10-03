// Near-duplicate detection for the cache.
//
// MinHash estimates the Jaccard similarity of two prompts' shingle sets from
// k = 64 hash minima; LSH banding (16 bands of 4 rows) finds candidates without
// comparing against every cached prompt. SimHash is here too, as the cheaper
// 64-bit alternative the benchmark compares against.
//
// Lexical similarity is not meaning: "convert 5 km to miles" and "convert 5
// miles to km" share every word. So a candidate must also pass a guard: the
// same numbers, the same PII placeholders, the same negation, and no content
// word that the other prompt lacks. The guard trades recall for safety; the
// benchmark reports both.

import { hashString } from "./rng";

const FILLER = new Set(["please", "pls", "plz", "kindly", "hi", "hello", "hey", "thanks", "thank", "thx", "quick", "question", "just", "quickly", "um", "uh", "so"]);
const FUNCTION = new Set(
  `a an the of to in on at for from by with about into over after before under between through during without within
and or but if then so than as is are was were be been being am do does did done can could would should will shall may might must
i me my mine we us our you your he him his she her it its they them their this that these those there here what which who whom whose
how why when where get got have has had any some all each every one also too very really ok okay`.split(/\s+/),
);
const NEGATION = /\b(?:not|no|never|none|nothing|nobody|cannot|without)\b|n't\b/;

/** Lower case, NFKC, placeholders kept as tokens, punctuation dropped (except inside numbers), fillers removed. */
export function normalizePrompt(text: string): string[] {
  const t = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/<([a-z]+)_(\d+)>/g, " ⟨$1_$2⟩ ")
    .replace(/(\d)[,](\d{3})/g, "$1$2")
    .replace(/[^\p{L}\p{N}⟨⟩_.'\s-]/gu, " ")
    .replace(/(?<!\d)[.](?!\d)/g, " ")
    .replace(/(?<![\p{L}])['-]|['-](?![\p{L}])/gu, " ");
  return t.split(/\s+/).filter((w) => w && !FILLER.has(w));
}

/** Unigrams plus bigrams, so word order counts ("km to miles" ≠ "miles to km"). */
export function shingles(tokens: readonly string[]): Set<string> {
  const s = new Set<string>(tokens);
  for (let i = 0; i + 1 < tokens.length; i++) s.add(tokens[i] + " " + tokens[i + 1]);
  return s;
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// ------------------------------------------------------------------ MinHash

export const MINHASH_K = 64;
export const LSH_BANDS = 16;
export const LSH_ROWS = MINHASH_K / LSH_BANDS;

// Fixed odd multipliers and offsets: h_i(x) = a_i·x + b_i (mod 2^32), then mixed.
const A = new Uint32Array(MINHASH_K);
const B = new Uint32Array(MINHASH_K);
for (let i = 0; i < MINHASH_K; i++) {
  A[i] = (hashString("relay-minhash-a" + i) | 1) >>> 0;
  B[i] = hashString("relay-minhash-b" + i);
}

const mix = (h: number) => {
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
};

export function minhash(set: Iterable<string>): Uint32Array {
  const sig = new Uint32Array(MINHASH_K).fill(0xffffffff);
  for (const s of set) {
    const x = hashString(s);
    for (let i = 0; i < MINHASH_K; i++) {
      const h = mix((Math.imul(A[i], x) + B[i]) >>> 0);
      if (h < sig[i]) sig[i] = h;
    }
  }
  return sig;
}

/** The fraction of matching minima estimates the Jaccard similarity (standard error ≈ √(J(1−J)/k)). */
export function minhashSimilarity(a: Uint32Array, b: Uint32Array): number {
  let eq = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) eq++;
  return eq / a.length;
}

/** One key per band; two signatures that agree on any band become candidates. */
export function lshKeys(sig: Uint32Array): string[] {
  const keys: string[] = [];
  for (let b = 0; b < LSH_BANDS; b++) {
    let h = 0x811c9dc5 ^ b;
    for (let r = 0; r < LSH_ROWS; r++) h = Math.imul(h ^ sig[b * LSH_ROWS + r], 0x01000193);
    keys.push(b + ":" + (h >>> 0).toString(36));
  }
  return keys;
}

/** Probability that two sets with Jaccard s share at least one band: 1 − (1 − s^r)^b. */
export const lshCandidateProbability = (s: number) => 1 - Math.pow(1 - Math.pow(s, LSH_ROWS), LSH_BANDS);

// ------------------------------------------------------------------ SimHash

/** 64-bit SimHash as two 32-bit halves, over the same shingles with unit weights. */
export function simhash(set: Iterable<string>): [number, number] {
  const v = new Int32Array(64);
  for (const s of set) {
    const h1 = hashString(s, 0x9747b28c);
    const h2 = hashString(s, 0x5bd1e995);
    for (let i = 0; i < 32; i++) {
      v[i] += (h1 >>> i) & 1 ? 1 : -1;
      v[32 + i] += (h2 >>> i) & 1 ? 1 : -1;
    }
  }
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < 32; i++) {
    if (v[i] > 0) lo |= 1 << i;
    if (v[32 + i] > 0) hi |= 1 << i;
  }
  return [lo >>> 0, hi >>> 0];
}

const popcount = (x: number) => {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24) & 0xff;
};

export const hamming = (a: [number, number], b: [number, number]) => popcount(a[0] ^ b[0]) + popcount(a[1] ^ b[1]);

// ------------------------------------------------------------------ guard

const isNumber = (w: string) => /\d/.test(w);
const isPlaceholder = (w: string) => w.startsWith("⟨");

function editDistanceAtMost1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      // allow one adjacent transposition as one edit
      if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
        i += 2;
        j += 2;
        continue;
      }
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

/** What the guard compares, computed once per prompt (the cache stores it with each entry). */
export interface GuardKey {
  /** Numbers and placeholders, sorted: these must match exactly. */
  anchor: string;
  negated: boolean;
  /** Content words in order. */
  content: string[];
}

export function guardKey(t: readonly string[]): GuardKey {
  const nums = t.filter(isNumber).sort().join(" ");
  const ph = t.filter(isPlaceholder).sort().join(" ");
  return { anchor: nums + "|" + ph, negated: NEGATION.test(t.join(" ")), content: t.filter((w) => !FUNCTION.has(w) && !isNumber(w) && !isPlaceholder(w)) };
}

/**
 * Accepts a near-duplicate only if the two prompts can differ in nothing that
 * carries meaning: numbers, placeholders and negation must match, and every
 * content word in one must appear in the other, in the same order (allowing a
 * one-letter typo in words of five letters or more).
 */
export function guardKeys(a: GuardKey, b: GuardKey): GuardResult {
  if (a.anchor !== b.anchor) {
    const [na, pa] = a.anchor.split("|");
    const [nb] = b.anchor.split("|");
    return { ok: false, reason: na !== nb ? "different numbers" : pa !== b.anchor.split("|")[1] ? "different placeholders" : "different numbers" };
  }
  if (a.negated !== b.negated) return { ok: false, reason: "negation differs" };
  const ca = a.content;
  const cb = b.content;
  if (ca.length !== cb.length) return { ok: false, reason: "different content words" };
  for (let i = 0; i < ca.length; i++) {
    const x = ca[i];
    const y = cb[i];
    if (x !== y && !(Math.min(x.length, y.length) >= 5 && editDistanceAtMost1(x, y))) return { ok: false, reason: `"${x}" vs "${y}"` };
  }
  return { ok: true };
}

export function guard(a: readonly string[], b: readonly string[]): GuardResult {
  return guardKeys(guardKey(a), guardKey(b));
}
