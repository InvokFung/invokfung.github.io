import type { Kernel } from "./kernel";
import { tokenize } from "./text";
import type { Meta } from "./types";

const ARRAY_TYPES = {
  u8: Uint8Array,
  u16: Uint16Array,
  u32: Uint32Array,
  i8: Int8Array,
  f32: Float32Array,
} as const;

export interface IndexArrays {
  /** Postings: offsets[t]..offsets[t+1] index into docs/tfs. */
  offsets: Uint32Array;
  docs: Uint16Array;
  tfs: Uint8Array;
  /** Token length of each chunk, for BM25 length normalisation. */
  lens: Uint16Array;
  /** LSA term matrix V (lsaTerms x k), int8 with a per-row scale. */
  V: Int8Array;
  vScale: Float32Array;
  /** Unit-length LSA vector of each chunk (chunks x k), int8 scaled by 127. */
  C: Int8Array;
}

export function readIndex(meta: Meta, buf: ArrayBuffer): IndexArrays {
  const out: Record<string, ArrayLike<number>> = {};
  for (const s of meta.sections) out[s.name] = new ARRAY_TYPES[s.type](buf, s.offset, s.length);
  return out as unknown as IndexArrays;
}

export interface Hit {
  chunk: number;
  score: number;
}

export type Mode = "bm25" | "lsa" | "hybrid";

/** Reciprocal-rank-fusion constant; 60 is the value from the original RRF paper. */
const RRF_K = 60;

export interface FusedHit extends Hit {
  /** 1-based rank of this passage in the keyword and meaning lists, or null if absent from the top 100. */
  kw: number | null;
  sem: number | null;
}

export interface Trace {
  words: { text: string; tokens: { t: string; known: boolean; df: number; idf: number; lsa: boolean }[] }[];
  bm25: { hits: Hit[]; postings: number; scored: number; ms: number };
  lsa: { hits: Hit[]; vector: Float32Array | null; ms: number };
  fused: { hits: FusedHit[]; union: number; both: number; ms: number };
  ms: number;
}

/** Reciprocal rank fusion: each list adds 1 / (k + rank) for every passage it ranks. */
export function fuse(a: Hit[], b: Hit[], limit: number): Hit[] {
  const fused = new Map<number, number>();
  for (const list of [a, b]) list.forEach((h, rank) => fused.set(h.chunk, (fused.get(h.chunk) ?? 0) + 1 / (RRF_K + rank + 1)));
  return [...fused].map(([chunk, score]) => ({ chunk, score })).sort((x, y) => y.score - x.score).slice(0, limit);
}

/** RRF contribution of a 1-based rank. */
export const rrf = (rank: number | null) => (rank === null ? 0 : 1 / (RRF_K + rank));

/**
 * Mean time of fn in milliseconds. Repeats until a few milliseconds have
 * passed, since browsers coarsen performance.now() to 0.1 ms or worse.
 */
export function timed<T>(fn: () => T, budget = 3): { value: T; ms: number } {
  let value = fn();
  let reps = 0;
  const t0 = performance.now();
  let t = t0;
  do {
    value = fn();
    reps++;
    t = performance.now();
  } while (t - t0 < budget && reps < 50);
  return { value, ms: (t - t0) / reps };
}

/**
 * The best `limit` positive scores, best first, ties by passage order. A
 * bounded min-heap keeps this linear in the passage count instead of
 * sorting every match.
 */
export function topK(scores: Float32Array, limit: number): Hit[] {
  const hs = new Float32Array(limit);
  const hc = new Int32Array(limit);
  let size = 0;
  // Is entry a ranked below entry b? Lower score, or same score and later passage.
  const below = (sa: number, ca: number, sb: number, cb: number) => sa < sb || (sa === sb && ca > cb);
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (!(s > 0)) continue;
    let j: number;
    if (size < limit) {
      j = size++;
      while (j > 0) {
        const p = (j - 1) >> 1;
        if (!below(s, i, hs[p], hc[p])) break;
        hs[j] = hs[p];
        hc[j] = hc[p];
        j = p;
      }
    } else {
      if (!below(hs[0], hc[0], s, i)) continue;
      j = 0;
      for (;;) {
        let m = 2 * j + 1;
        if (m >= size) break;
        if (m + 1 < size && below(hs[m + 1], hc[m + 1], hs[m], hc[m])) m++;
        if (!below(hs[m], hc[m], s, i)) break;
        hs[j] = hs[m];
        hc[j] = hc[m];
        j = m;
      }
    }
    hs[j] = s;
    hc[j] = i;
  }
  const hits: Hit[] = [];
  for (let j = 0; j < size; j++) hits.push({ chunk: hc[j], score: hs[j] });
  return hits.sort((a, b) => b.score - a.score || a.chunk - b.chunk);
}

export class Engine {
  readonly meta: Meta;
  readonly ix: IndexArrays;
  private termId: Map<string, number>;
  private k: number;
  private kernel: Kernel | null = null;

  constructor(meta: Meta, ix: IndexArrays) {
    this.meta = meta;
    this.ix = ix;
    this.termId = new Map(meta.terms.map((t, i) => [t, i]));
    this.k = meta.lsa.k;
  }

  private queryTerms(query: string): Map<number, number> {
    const counts = new Map<number, number>();
    for (const tok of tokenize(query)) {
      const id = this.termId.get(tok);
      if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }

  bm25(query: string, limit = 100): Hit[] {
    return this.bm25Scored(query, limit).hits;
  }

  /** BM25 plus the work it did: postings walked and passages that got a score. */
  private bm25Scored(query: string, limit: number): { hits: Hit[]; postings: number; scored: number } {
    const { offsets, docs, tfs, lens } = this.ix;
    const { k1, b, avgLen } = this.meta.bm25;
    const n = this.meta.chunks.length;
    const scores = new Float32Array(n);
    let postings = 0;
    for (const [t, qtf] of this.queryTerms(query)) {
      const start = offsets[t];
      const end = offsets[t + 1];
      const df = end - start;
      postings += df;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      for (let j = start; j < end; j++) {
        const tf = tfs[j];
        const norm = k1 * (1 - b + (b * lens[docs[j]]) / avgLen);
        scores[docs[j]] += qtf * idf * ((tf * (k1 + 1)) / (tf + norm));
      }
    }
    let scored = 0;
    for (let i = 0; i < n; i++) if (scores[i] > 0) scored++;
    return { hits: topK(scores, limit), postings, scored };
  }

  /** Projects a query into the LSA space: q · V, normalised. */
  embed(query: string): Float32Array | null {
    const { V, vScale } = this.ix;
    const { rows, idf } = this.meta.lsa;
    const k = this.k;
    const q = new Float32Array(k);
    let any = false;
    let norm = 0;
    const weights: [number, number][] = [];
    for (const [t, tf] of this.queryTerms(query)) {
      const row = rows[t];
      if (row < 0) continue;
      const w = (1 + Math.log(tf)) * idf[row];
      weights.push([row, w]);
      norm += w * w;
    }
    if (!weights.length) return null;
    norm = Math.sqrt(norm);
    for (const [row, w] of weights) {
      const s = (w / norm) * vScale[row];
      const base = row * k;
      for (let d = 0; d < k; d++) q[d] += s * V[base + d];
      any = true;
    }
    if (!any) return null;
    let qn = 0;
    for (let d = 0; d < k; d++) qn += q[d] * q[d];
    qn = Math.sqrt(qn) || 1;
    for (let d = 0; d < k; d++) q[d] /= qn;
    return q;
  }

  /** Uses a compiled dot-product kernel for the cosine scan; both paths give identical scores. */
  useKernel(kernel: Kernel | null) {
    this.kernel = kernel;
  }

  get kernelName(): string {
    return this.kernel?.name ?? "JavaScript";
  }

  /**
   * Cosine of a unit query with every passage. The query is quantized to
   * int16 and the sums are exact int32, so the WebAssembly kernel and the
   * JavaScript loop below agree bit for bit.
   */
  private cosineAll(q: Float32Array): Float32Array {
    const k = this.k;
    const n = this.meta.chunks.length;
    let max = 1e-12;
    for (let d = 0; d < k; d++) max = Math.max(max, Math.abs(q[d]));
    const scale = 32767 / max;
    const qi = new Int16Array(k);
    for (let d = 0; d < k; d++) qi[d] = Math.round(q[d] * scale);
    const dots = this.kernel ? this.kernel.dots(qi) : this.dotsJS(qi);
    const scores = new Float32Array(n);
    const f = 1 / (scale * 127);
    for (let i = 0; i < n; i++) scores[i] = dots[i] * f;
    return scores;
  }

  private dotsJS(qi: Int16Array): Int32Array {
    const { C } = this.ix;
    const k = this.k;
    const n = this.meta.chunks.length;
    const out = new Int32Array(n);
    for (let i = 0, base = 0; i < n; i++, base += k) {
      let a = 0;
      let b = 0;
      for (let d = 0; d < k; d += 2) {
        a = (a + qi[d] * C[base + d]) | 0;
        b = (b + qi[d + 1] * C[base + d + 1]) | 0;
      }
      out[i] = (a + b) | 0;
    }
    return out;
  }

  lsa(query: string, limit = 100): Hit[] {
    const q = this.embed(query);
    return q ? topK(this.cosineAll(q), limit) : [];
  }

  hybrid(query: string, limit = 100): Hit[] {
    return fuse(this.bm25(query, 100), this.lsa(query, 100), limit);
  }

  /**
   * Runs the hybrid search one stage at a time, timing each stage, and keeps
   * the intermediate results so the page can show how the answer was built.
   */
  trace(query: string): Trace {
    const n = this.meta.chunks.length;
    const words = query
      .split(/\s+/)
      .filter(Boolean)
      .map((text) => ({
        text,
        tokens: tokenize(text).map((t) => {
          const id = this.termId.get(t);
          const df = id === undefined ? 0 : this.ix.offsets[id + 1] - this.ix.offsets[id];
          return {
            t,
            known: id !== undefined,
            df,
            idf: df ? Math.log(1 + (n - df + 0.5) / (df + 0.5)) : 0,
            lsa: id !== undefined && this.meta.lsa.rows[id] >= 0,
          };
        }),
      }));
    const kw = timed(() => this.bm25Scored(query, 100));
    const vec = timed(() => this.embed(query));
    const cos = timed(() => (vec.value ? topK(this.cosineAll(vec.value), 100) : []));
    const fused = timed(() => fuse(kw.value.hits, cos.value, 100));
    const kwRank = new Map(kw.value.hits.map((h, i) => [h.chunk, i + 1]));
    const semRank = new Map(cos.value.map((h, i) => [h.chunk, i + 1]));
    const ranked = fused.value.map((h) => ({ ...h, kw: kwRank.get(h.chunk) ?? null, sem: semRank.get(h.chunk) ?? null }));
    return {
      words,
      bm25: { hits: kw.value.hits, postings: kw.value.postings, scored: kw.value.scored, ms: kw.ms },
      lsa: { hits: cos.value, vector: vec.value, ms: vec.ms + cos.ms },
      fused: {
        hits: ranked,
        union: ranked.length,
        both: ranked.filter((h) => h.kw !== null && h.sem !== null).length,
        ms: fused.ms,
      },
      ms: kw.ms + vec.ms + cos.ms + fused.ms,
    };
  }

  search(query: string, mode: Mode = "hybrid", limit = 100): Hit[] {
    return mode === "bm25" ? this.bm25(query, limit) : mode === "lsa" ? this.lsa(query, limit) : this.hybrid(query, limit);
  }

  /** Passages from other posts closest in meaning to `chunk`. */
  related(chunk: number, limit = 6): Hit[] {
    const k = this.k;
    const q = new Float32Array(k);
    for (let d = 0; d < k; d++) q[d] = this.ix.C[chunk * k + d] / 127;
    const post = this.meta.chunks[chunk].p;
    const hits = topK(this.cosineAll(q), 200).filter((h) => this.meta.chunks[h.chunk].p !== post);
    return firstPerPost(this.meta, hits).slice(0, limit);
  }
}

/** Keeps the best-scoring chunk of each post, preserving order. */
export function firstPerPost<T extends Hit>(meta: Meta, hits: T[]): T[] {
  const seen = new Set<number>();
  return hits.filter((h) => {
    const p = meta.chunks[h.chunk].p;
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}
