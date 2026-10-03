// Scoring against ground truth. Used by `npm run eval` and by the page's
// live scoreboard on the synthetic data; never by the pipeline itself.

import type { PiiSpan, PiiType } from "./pii";

export interface PRF {
  precision: number;
  recall: number;
  f1: number;
}

const f1 = (p: number, r: number) => (p + r ? (2 * p * r) / (p + r) : 0);
const c2 = (n: number) => (n * (n - 1)) / 2;

/** Pairwise precision/recall/F1 of a clustering against true entity labels, via the contingency table. */
export function pairwise(pred: ArrayLike<number>, truth: ArrayLike<number>): PRF & { tp: number; predicted: number; actual: number } {
  const n = pred.length;
  const both = new Map<string, number>();
  const pc = new Map<number, number>();
  const tc = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const k = `${pred[i]}:${truth[i]}`;
    both.set(k, (both.get(k) ?? 0) + 1);
    pc.set(pred[i], (pc.get(pred[i]) ?? 0) + 1);
    tc.set(truth[i], (tc.get(truth[i]) ?? 0) + 1);
  }
  let tp = 0;
  for (const v of both.values()) tp += c2(v);
  let predicted = 0;
  for (const v of pc.values()) predicted += c2(v);
  let actual = 0;
  for (const v of tc.values()) actual += c2(v);
  const precision = predicted ? tp / predicted : 1;
  const recall = actual ? tp / actual : 1;
  return { precision, recall, f1: f1(precision, recall), tp, predicted, actual };
}

/** B-cubed precision/recall/F1 (Bagga & Baldwin): per-record overlap of its cluster and its entity, averaged. */
export function bcubed(pred: ArrayLike<number>, truth: ArrayLike<number>): PRF {
  const n = pred.length;
  const both = new Map<string, number>();
  const pc = new Map<number, number>();
  const tc = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const k = `${pred[i]}:${truth[i]}`;
    both.set(k, (both.get(k) ?? 0) + 1);
    pc.set(pred[i], (pc.get(pred[i]) ?? 0) + 1);
    tc.set(truth[i], (tc.get(truth[i]) ?? 0) + 1);
  }
  let p = 0;
  let r = 0;
  for (let i = 0; i < n; i++) {
    const inter = both.get(`${pred[i]}:${truth[i]}`)!;
    p += inter / pc.get(pred[i])!;
    r += inter / tc.get(truth[i])!;
  }
  const precision = n ? p / n : 1;
  const recall = n ? r / n : 1;
  return { precision, recall, f1: f1(precision, recall) };
}

/** Share of true matching pairs that blocking kept as candidates. */
export function pairsCompleteness(a: Int32Array, b: Int32Array, truth: ArrayLike<number>): { found: number; total: number; completeness: number } {
  let found = 0;
  for (let p = 0; p < a.length; p++) if (truth[a[p]] === truth[b[p]]) found++;
  const tc = new Map<number, number>();
  for (let i = 0; i < truth.length; i++) tc.set(truth[i], (tc.get(truth[i]) ?? 0) + 1);
  let total = 0;
  for (const v of tc.values()) total += c2(v);
  return { found, total, completeness: total ? found / total : 1 };
}

export interface TruthSpan {
  source: string;
  row: number;
  column: string;
  type: PiiType;
  start: number;
  end: number;
}

export interface FoundSpan extends PiiSpan {
  source: string;
  row: number;
  column: string;
}

/** Span-level detection scores: a found span is correct when it overlaps a true span of the same type in the same cell. */
export function spanScores(found: FoundSpan[], truth: TruthSpan[]): { overall: PRF & { tp: number; fp: number; fn: number }; byType: Record<string, PRF & { tp: number; fp: number; fn: number }> } {
  const cell = (s: { source: string; row: number; column: string }) => `${s.source}\u0000${s.row}\u0000${s.column}`;
  const byCell = new Map<string, TruthSpan[]>();
  for (const t of truth) {
    const k = cell(t);
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k)!.push(t);
  }
  const types = [...new Set([...truth.map((t) => t.type), ...found.map((f) => f.type)])];
  const acc: Record<string, { tp: number; fp: number; fn: number }> = {};
  for (const t of types) acc[t] = { tp: 0, fp: 0, fn: 0 };
  const matched = new Set<TruthSpan>();
  for (const f of found) {
    const cands = byCell.get(cell(f)) ?? [];
    const hit = cands.find((t) => !matched.has(t) && t.type === f.type && f.start < t.end && f.end > t.start);
    if (hit) {
      matched.add(hit);
      acc[f.type].tp++;
    } else acc[f.type].fp++;
  }
  for (const t of truth) if (!matched.has(t)) acc[t.type].fn++;
  const score = (x: { tp: number; fp: number; fn: number }) => {
    const precision = x.tp + x.fp ? x.tp / (x.tp + x.fp) : 1;
    const recall = x.tp + x.fn ? x.tp / (x.tp + x.fn) : 1;
    return { precision, recall, f1: f1(precision, recall), ...x };
  };
  const total = Object.values(acc).reduce((s, x) => ({ tp: s.tp + x.tp, fp: s.fp + x.fp, fn: s.fn + x.fn }), { tp: 0, fp: 0, fn: 0 });
  const byType: Record<string, PRF & { tp: number; fp: number; fn: number }> = {};
  for (const t of types) byType[t] = score(acc[t]);
  return { overall: score(total), byType };
}
