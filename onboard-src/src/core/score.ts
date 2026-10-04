// Scoring a session against the generator's truth: shared by `npm run eval`
// and the page's live scoreboard. Nothing in the pipeline imports this.

import type { Truth } from "../gen/generate";
import { bcubed, pairsCompleteness, pairwise, spanScores, type FoundSpan, type PRF } from "./evaluate";
import { canonicalEmail, isNullish } from "./normalize";
import { detectPii } from "./pii";
import type { Session } from "./pipeline";
import { UnionFind } from "./unionfind";

/** Integer entity label per record, in the session's record order. */
export function entityLabels(s: Session, truth: Truth): Int32Array {
  const ids = new Map<string, number>();
  const out = new Int32Array(s.recs.length);
  for (const r of s.recs) {
    const key = truth.entities[r.source]?.[r.row] ?? `unknown:${r.i}`;
    let id = ids.get(key);
    if (id === undefined) ids.set(key, (id = ids.size));
    out[r.i] = id;
  }
  return out;
}

/** The naive baseline: records are the same customer when their email cells are equal (raw: as exported; canonical: lowercased, +tags removed). */
export function emailBaseline(s: Session, mode: "raw" | "canonical"): Int32Array {
  const uf = new UnionFind(s.recs.length);
  const first = new Map<string, number>();
  for (const r of s.recs) {
    const c = r.col.email;
    if (c === undefined) continue;
    const raw = (s.tableBySource.get(r.source)!.rows[r.row][c] ?? "").trim();
    if (!raw || isNullish(raw)) continue;
    const key = mode === "raw" ? raw : canonicalEmail(raw).email;
    const f = first.get(key);
    if (f === undefined) first.set(key, r.i);
    else uf.union(f, r.i);
  }
  return uf.labels();
}

export interface ErScore {
  pairwise: PRF;
  bcubed: PRF;
  clusters: number;
}

export function scoreLabels(pred: ArrayLike<number>, truth: ArrayLike<number>): ErScore {
  const pw = pairwise(pred, truth);
  return { pairwise: { precision: pw.precision, recall: pw.recall, f1: pw.f1 }, bcubed: bcubed(pred, truth), clusters: new Set(Array.from(pred)).size };
}

/** What a perfect reviewer would do with the current queue: accept the true pairs, reject the rest. */
export function oracleDecisions(s: Session, labels: Int32Array): Map<number, boolean> {
  const d = new Map(s.decisions);
  for (const p of s.clustering.review) d.set(p, labels[s.er.pairs.a[p]] === labels[s.er.pairs.b[p]]);
  return d;
}

export interface LiveScore {
  er: ErScore;
  trueEntities: number;
  review: { size: number; trueMatches: number };
  pairsCompleteness: number;
}

export function liveScore(s: Session, labels: Int32Array): LiveScore {
  const review = s.clustering.review;
  let trueMatches = 0;
  for (const p of review) if (labels[s.er.pairs.a[p]] === labels[s.er.pairs.b[p]]) trueMatches++;
  return {
    er: scoreLabels(s.clustering.labels, labels),
    trueEntities: new Set(Array.from(labels)).size,
    review: { size: review.length, trueMatches },
    pairsCompleteness: pairsCompleteness(s.er.pairs.a, s.er.pairs.b, labels).completeness,
  };
}

/** PII spans found in the columns where the generator injected PII, for span-level scoring. */
export function foundSpans(s: Session, truth: Truth, validate: boolean): FoundSpan[] {
  const cols = new Set(truth.pii.map((t) => `${t.source}\u0000${t.column}`));
  const found = new Map(s.piiCells.map((x) => [`${x.source}:${x.row}:${x.col}`, x.spans]));
  const out: FoundSpan[] = [];
  for (const tb of s.tables)
    tb.columns.forEach((column, c) => {
      if (!cols.has(`${tb.source}\u0000${column}`)) return;
      tb.rows.forEach((row, r) => {
        const v = row[c];
        if (!v) return;
        const spans = validate ? (found.get(`${tb.source}:${r}:${c}`) ?? []) : detectPii(v, { validate: false });
        for (const sp of spans) out.push({ ...sp, source: tb.source, row: r, column });
      });
    });
  return out;
}

export function piiScore(s: Session, truth: Truth, validate = true) {
  return spanScores(foundSpans(s, truth, validate), truth.pii);
}

/** Share of source columns mapped to their true canonical field (unmapped counts when it should be unmapped). */
export function mappingScore(s: Session, truth: Truth) {
  let correct = 0;
  let total = 0;
  const wrong: { source: string; column: string; got: string | null; want: string | null }[] = [];
  for (const [source, m] of s.mappings)
    for (const c of m) {
      const want = truth.mapping[source]?.[c.column] ?? null;
      total++;
      if (want === c.field) correct++;
      else wrong.push({ source, column: c.column, got: c.field, want });
    }
  return { accuracy: total ? correct / total : 0, correct, total, wrong };
}
