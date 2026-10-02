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
  /** 3D galaxy position of each chunk (chunks x 3). */
  layout: Float32Array;
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

function topK(scores: Float32Array, limit: number): Hit[] {
  const hits: Hit[] = [];
  for (let i = 0; i < scores.length; i++) if (scores[i] > 0) hits.push({ chunk: i, score: scores[i] });
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

export class Engine {
  readonly meta: Meta;
  readonly ix: IndexArrays;
  private termId: Map<string, number>;
  private k: number;

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
    const { offsets, docs, tfs, lens } = this.ix;
    const { k1, b, avgLen } = this.meta.bm25;
    const n = this.meta.chunks.length;
    const scores = new Float32Array(n);
    for (const [t, qtf] of this.queryTerms(query)) {
      const start = offsets[t];
      const end = offsets[t + 1];
      const df = end - start;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      for (let j = start; j < end; j++) {
        const tf = tfs[j];
        const norm = k1 * (1 - b + (b * lens[docs[j]]) / avgLen);
        scores[docs[j]] += qtf * idf * ((tf * (k1 + 1)) / (tf + norm));
      }
    }
    return topK(scores, limit);
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

  private cosineAll(q: Float32Array): Float32Array {
    const { C } = this.ix;
    const k = this.k;
    const n = this.meta.chunks.length;
    const scores = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const base = i * k;
      for (let d = 0; d < k; d++) s += q[d] * C[base + d];
      scores[i] = s / 127;
    }
    return scores;
  }

  lsa(query: string, limit = 100): Hit[] {
    const q = this.embed(query);
    return q ? topK(this.cosineAll(q), limit) : [];
  }

  hybrid(query: string, limit = 100): Hit[] {
    const fused = new Map<number, number>();
    for (const list of [this.bm25(query, 100), this.lsa(query, 100)]) {
      list.forEach((h, rank) => fused.set(h.chunk, (fused.get(h.chunk) ?? 0) + 1 / (RRF_K + rank + 1)));
    }
    return [...fused].map(([chunk, score]) => ({ chunk, score })).sort((a, b) => b.score - a.score).slice(0, limit);
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
export function firstPerPost(meta: Meta, hits: Hit[]): Hit[] {
  const seen = new Set<number>();
  return hits.filter((h) => {
    const p = meta.chunks[h.chunk].p;
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}
