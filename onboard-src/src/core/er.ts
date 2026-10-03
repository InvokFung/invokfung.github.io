// Entity resolution end to end: blocking, comparison vectors, u from random
// pairs, m by EM, a weight and probability per candidate pair with
// term-frequency adjustments, guard rules, then clustering with union-find
// that respects cannot-link constraints.

import { block, type BlockingResult } from "./blocking";
import { COMPARATORS, gammaOf, isSwapped } from "./compare";
import { em, estimateU, initialM, levelWeights, probability, toPatterns, type FsParams } from "./fs";
import { Rng } from "./rng";
import type { Rec } from "./types";
import { UnionFind } from "./unionfind";

export interface ErModel {
  comparators: { key: string; label: string; levels: string[] }[];
  /** m from EM over candidates, u from random pairs: what scores a pair. */
  params: FsParams;
  /** EM's own u: the non-matches that survived blocking. */
  blockedU: number[][];
  /** EM's share of matches among the candidates. */
  blockedLambda: number;
  /** Prior share of matches among all pairs. */
  lambda: number;
  /** log2(m/u) per comparator level. */
  weights: number[][];
  /** log2(λ / (1 − λ)). */
  prior: number;
  iterations: number;
  logLik: number[];
  converged: boolean;
  uSample: number;
  patterns: number;
}

export interface ErPairs {
  a: Int32Array;
  b: Int32Array;
  /** pairs × K comparison levels. */
  gammas: Int8Array;
  /** Per-pair, per-comparator weight actually used (after term-frequency adjustment). pairs × K. */
  contrib: Float32Array;
  weight: Float32Array;
  prob: Float32Array;
  /** Guard flags: VETO.FIRST, VETO.DOB. A vetoed pair never merges on its own. */
  veto: Uint8Array;
}

export const VETO = { FIRST: 1, DOB: 2 } as const;
export const VETO_LABEL: Record<number, string> = { 1: "first names differ", 2: "dates of birth differ" };

export interface ErResult {
  blocking: BlockingResult;
  pairs: ErPairs;
  model: ErModel;
  timings: { blocking: number; compare: number; em: number };
  /** Pairs whose weight a term-frequency adjustment lowered. */
  tfAdjusted: number;
}

export interface Thresholds {
  /** Pairs at or above this probability are merged automatically. */
  match: number;
  /** Pairs between this and `match` go to the review queue. */
  review: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { match: 0.95, review: 0.6 };

const now = () => performance.now();

/** The value an exact agreement was on, for the comparators where a common value is weaker evidence. */
function tfKey(k: number, level: number, r: Rec): string | null {
  switch (COMPARATORS[k].key) {
    case "first":
      return level === 0 ? `f:${r.k.first}` : null;
    case "last":
      return level === 0 ? `l:${r.k.last}` : null;
    case "email":
      return level === 0 ? `e:${r.email}` : level === 1 ? `m:${r.k.emailLocal}` : null;
    case "phone":
      return level === 0 ? `p:${r.phone}` : null;
    case "address":
      return level === 0 ? `a:${r.k.postcode}|${r.k.houseNo}` : level === 1 ? `z:${r.k.postcode}` : null;
    case "company":
      return level === 0 ? `c:${r.k.company}` : null;
  }
  return null;
}

function termFrequencies(recs: Rec[], live: number[]): { count: Map<string, number>; total: Map<string, number> } {
  const count = new Map<string, number>();
  const total = new Map<string, number>();
  const bump = (key: string) => {
    count.set(key, (count.get(key) ?? 0) + 1);
    const prefix = key.slice(0, 2);
    total.set(prefix, (total.get(prefix) ?? 0) + 1);
  };
  for (const i of live) {
    const r = recs[i];
    if (r.k.first) bump(`f:${r.k.first}`);
    if (r.k.last) bump(`l:${r.k.last}`);
    if (r.email) bump(`e:${r.email}`);
    if (r.k.emailLocal) bump(`m:${r.k.emailLocal}`);
    if (r.phone) bump(`p:${r.phone}`);
    if (r.k.postcode) {
      bump(`a:${r.k.postcode}|${r.k.houseNo}`);
      bump(`z:${r.k.postcode}`);
    }
    if (r.k.company) bump(`c:${r.k.company}`);
  }
  return { count, total };
}

export function resolve(recs: Rec[], opts: { uSample?: number; seed?: string; skip?: Uint8Array; tf?: boolean } = {}): ErResult {
  const K = COMPARATORS.length;
  const levels = COMPARATORS.map((c) => c.levels.length);
  let t = now();
  const blocking = block(recs, undefined, undefined, opts.skip);
  const tBlock = now() - t;

  t = now();
  const P = blocking.candidates;
  const gammas = new Int8Array(P * K);
  const swapped = new Uint8Array(P);
  for (let p = 0; p < P; p++) {
    const a = recs[blocking.a[p]];
    const b = recs[blocking.b[p]];
    gammaOf(a, b, gammas, p * K);
    swapped[p] = isSwapped(a, b) ? 1 : 0;
  }

  // u: comparison levels among random pairs
  const live = opts.skip ? recs.filter((r) => !opts.skip![r.i]).map((r) => r.i) : recs.map((r) => r.i);
  const n = live.length;
  const rng = new Rng(opts.seed ?? "u-sample");
  const S = Math.min(opts.uSample ?? 60000, Math.max(0, (n * (n - 1)) / 2));
  const ug = new Int8Array(S * K);
  for (let s = 0; s < S; s++) {
    const i = rng.int(n);
    let j = rng.int(n - 1);
    if (j >= i) j++;
    gammaOf(recs[live[i]], recs[live[j]], ug, s * K);
  }
  const tCompare = now() - t;

  t = now();
  // u comes from random pairs: how often two unrelated records agree by chance.
  // m comes from EM over the candidate pairs. EM also fits a u, but that one
  // describes non-matches that survived blocking (they share a name sound or
  // a mailbox), so it is kept for display and not used to score.
  const u = estimateU(ug, K, levels);
  const pat = toPatterns(gammas, K);
  const fit = em(pat, { lambda: 0.2, m: initialM(levels), u }, { fixU: false });
  const params: FsParams = { lambda: fit.params.lambda, m: fit.params.m, u };
  const weights = levelWeights(params);
  // prior odds over all pairs: the matches EM expects among the candidates, out of every possible pair
  const expected = fit.params.lambda * P;
  const all = (n * (n - 1)) / 2;
  const lambda = Math.min(0.5, expected / Math.max(1, all));
  const prior = Math.log2(lambda / (1 - lambda));

  // Term-frequency adjustment: agreeing on a value many records share (a
  // company switchboard, a common surname) is weaker evidence than agreeing
  // on a rare one. The adjustment only ever lowers a weight.
  const tf = termFrequencies(recs, live);
  const contrib = new Float32Array(P * K);
  const weight = new Float32Array(P);
  const prob = new Float32Array(P);
  const veto = new Uint8Array(P);
  const firstK = COMPARATORS.findIndex((c) => c.key === "first");
  const dobK = COMPARATORS.findIndex((c) => c.key === "dob");
  let tfAdjusted = 0;
  for (let p = 0; p < P; p++) {
    const a = recs[blocking.a[p]];
    let w = prior;
    let lowered = false;
    for (let k = 0; k < K; k++) {
      const lv = gammas[p * K + k];
      if (lv < 0) continue;
      let wk = weights[k][lv];
      const key = wk > 0 && opts.tf !== false ? tfKey(k, lv, a) : null;
      if (key) {
        const c = tf.count.get(key) ?? 1;
        const tot = tf.total.get(key.slice(0, 2)) ?? 1;
        const wtf = Math.log2(Math.max(params.m[k][lv], 1e-3) / Math.max(c / tot, 1e-6));
        if (wtf < wk) {
          wk = wtf;
          lowered = true;
        }
      }
      contrib[p * K + k] = wk;
      w += wk;
    }
    if (lowered) tfAdjusted++;
    weight[p] = w;
    prob[p] = probability(w);
    if (gammas[p * K + firstK] === COMPARATORS[firstK].levels.length - 1 && !swapped[p]) veto[p] |= VETO.FIRST;
    if (gammas[p * K + dobK] === COMPARATORS[dobK].levels.length - 1) veto[p] |= VETO.DOB;
  }
  const tEm = now() - t;

  return {
    blocking,
    pairs: { a: blocking.a, b: blocking.b, gammas, contrib, weight, prob, veto },
    model: {
      comparators: COMPARATORS.map(({ key, label, levels }) => ({ key, label, levels })),
      params,
      blockedU: fit.params.u,
      blockedLambda: fit.params.lambda,
      lambda,
      weights,
      prior,
      iterations: fit.iterations,
      logLik: fit.logLik,
      converged: fit.converged,
      uSample: S,
      patterns: pat.counts.length,
    },
    timings: { blocking: tBlock, compare: tCompare, em: tEm },
    tfAdjusted,
  };
}

export interface Clustering {
  /** Cluster id of each record. */
  labels: Int32Array;
  clusters: number;
  /** Pairs merged automatically (at or above the match threshold, not vetoed or rejected). */
  autoMatched: number;
  /** Pairs merged because a reviewer accepted them. */
  accepted: number;
  /** Merges skipped because they would have joined records that must stay apart. */
  blocked: number;
  /** Pair indices waiting for review, best first. */
  review: number[];
}

/** Review decisions by pair index: true = same customer, false = different. */
export type Decisions = Map<number, boolean>;

/**
 * Union-find over the accepted and above-threshold pairs, strongest first,
 * refusing any merge that would put two records with a cannot-link (a
 * reviewer's rejection or a guard rule) into one cluster.
 */
export function clusterize(n: number, pairs: ErPairs, th: Thresholds, decisions: Decisions = new Map(), excluded?: Uint8Array, opts: { guards?: boolean } = {}): Clustering {
  const guards = opts.guards !== false;
  const uf = new UnionFind(n);
  const P = pairs.prob.length;
  const merges: number[] = [];
  const review: number[] = [];
  const cannot = new Map<number, number[]>();
  const link = (x: number, y: number) => {
    let l = cannot.get(x);
    if (!l) cannot.set(x, (l = []));
    l.push(y);
  };
  for (let p = 0; p < P; p++) {
    const a = pairs.a[p];
    const b = pairs.b[p];
    if (excluded && (excluded[a] || excluded[b])) continue;
    const d = decisions.get(p);
    const pr = pairs.prob[p];
    if (d === true) merges.push(p);
    else if (d === false || (guards && pairs.veto[p])) {
      link(a, b);
      link(b, a);
      if (d === undefined && pr >= th.review) review.push(p);
    } else if (pr >= th.match) merges.push(p);
    else if (pr >= th.review) review.push(p);
  }
  // reviewer-accepted pairs first, then by probability
  merges.sort((x, y) => (decisions.get(y) === true ? 1 : 0) - (decisions.get(x) === true ? 1 : 0) || pairs.prob[y] - pairs.prob[x]);

  // cannot-link partners per cluster root
  const roots = new Map<number, number[]>();
  for (const [x, ys] of cannot) roots.set(x, [...ys]);
  let autoMatched = 0;
  let accepted = 0;
  let blocked = 0;
  for (const p of merges) {
    const ra = uf.find(pairs.a[p]);
    const rb = uf.find(pairs.b[p]);
    if (ra === rb) {
      if (decisions.get(p) === true) accepted++;
      else autoMatched++;
      continue;
    }
    const la = roots.get(ra);
    const lb = roots.get(rb);
    const [small, other] = (la?.length ?? 0) <= (lb?.length ?? 0) ? [la, rb] : [lb, ra];
    let conflict = false;
    if (small) for (const x of small) if (uf.find(x) === other) {
      conflict = true;
      break;
    }
    // a reviewer's "same" overrides a guard rule, but never another reviewer's "different"
    if (conflict && decisions.get(p) === true) {
      conflict = false;
      const members = (r: number) => {
        const out: number[] = [];
        for (let i = 0; i < n; i++) if (uf.find(i) === r) out.push(i);
        return out;
      };
      const A = new Set(members(ra));
      for (const i of members(rb))
        for (const [q, d] of decisions)
          if (d === false && ((pairs.a[q] === i && A.has(pairs.b[q])) || (pairs.b[q] === i && A.has(pairs.a[q])))) conflict = true;
    }
    if (conflict) {
      blocked++;
      continue;
    }
    uf.union(ra, rb);
    const root = uf.find(ra);
    const merged = [...(la ?? []), ...(lb ?? [])];
    roots.delete(ra);
    roots.delete(rb);
    if (merged.length) roots.set(root, merged);
    if (decisions.get(p) === true) accepted++;
    else autoMatched++;
  }
  review.sort((x, y) => pairs.prob[y] - pairs.prob[x]);
  return { labels: uf.labels(), clusters: uf.sets, autoMatched, accepted, blocked, review };
}
