// Root-cause ranking. Three kinds of evidence, combined:
//
// 1. Anomaly per node on what the node did itself: its exclusive (self) time
//    and the errors that started there. Inclusive latency and propagated
//    errors would light up every caller of a broken service.
// 2. Propagation over the call graph: a personalized random walk that starts
//    on the anomalous nodes and moves from caller to callee along edges whose
//    calls got slower or failed more often. Faults travel up the call graph;
//    the walk travels down it, against the direction of propagation, so blame
//    settles on the deepest anomalous dependency rather than on the gateway
//    that shows the symptom, even through healthy services in between.
// 3. Critical-path diff: how much of the extra end-to-end time, summed over
//    all traffic, was spent in each node, from kept traces before and after
//    the onset, weighted back to the full population by their sampling rates.

import { MAD_SIGMA, mad, median } from "./anomaly";
import { pageRank, type WeightedEdge } from "./pagerank";
import type { FlowConfig, MinuteSummary, StoredTrace } from "./pipeline";
import { buildTree, criticalPath } from "./tracetree";
import { Kind } from "./types";

export interface RcaWeights {
  pagerank: number;
  anomaly: number;
  criticalPath: number;
}

export const DEFAULT_WEIGHTS: RcaWeights = { pagerank: 0.6, anomaly: 0.2, criticalPath: 0.2 };

export interface RcaInput {
  history: MinuteSummary[];
  store: StoredTrace[];
  flow: string;
  flowRoot: string | null;
  onsetMinute: number;
  nowMinute: number;
  flows: FlowConfig[];
  weights?: RcaWeights;
}

export interface EdgeEvidence {
  from: string;
  to: string;
  p95Before: number;
  p95After: number;
  errBefore: number;
  errAfter: number;
  anomaly: number;
}

export interface Candidate {
  node: string;
  score: number;
  /** 0..1, from the stronger of the two z-scores. */
  anomaly: number;
  zSelf: number;
  zErr: number;
  /** Mean self time per request, ms. */
  selfBefore: number;
  selfAfter: number;
  ownErrBefore: number;
  ownErrAfter: number;
  /** Stationary probability of the blame walk. */
  pagerank: number;
  /** Extra critical-path ms per second of traffic spent in this node. */
  cpDeltaMs: number;
  /** Share of the critical-path growth that happened in this node. */
  cpShare: number;
  /** Inclusive p99 before and after, as a dashboard would show it. */
  p99Before: number;
  p99After: number;
  /** Call path from the alerting service, through the most anomalous calls. */
  path: string[];
  /** The most anomalous call into this node. */
  inbound?: EdgeEvidence;
  version?: { from: string; to: string; share: number };
}

export interface RcaResult {
  flow: string;
  minute: number;
  onsetMinute: number;
  ranking: Candidate[];
  /** Simple strategies to compare against, as ranked node lists. */
  baselines: { highestP99: string[]; p99Jump: string[]; alerting: string[] };
  /** The method with pieces of evidence removed. */
  ablations: { anomalyOnly: string[]; pagerankOnly: string[]; noCriticalPath: string[]; selfOnlyWalk: string[] };
  traces: { before: number; after: number };
}

const BASELINE_MIN = 30;
const RECENT_MIN = 5;

/** z below 2 is noise; above it, anomaly rises towards 1. */
export const squash = (z: number) => (z <= 2 ? 0 : 1 - Math.exp(-(z - 2) / 4));

/** Robust z of the recent mean against a baseline sample, with a floor on the scale. */
function shiftZ(base: number[], recent: number[], floor: number): number {
  if (base.length < 5 || !recent.length) return 0;
  const m = median(base);
  const s = Math.max(MAD_SIGMA * mad(base, m), floor);
  return (recent.reduce((a, b) => a + b, 0) / recent.length - m) / s;
}

/** Binomial z of errors in the recent window against the baseline ratio (floored). */
function errorZ(eB: number, nB: number, eA: number, nA: number): number {
  if (nA <= 0) return 0;
  const p = Math.max(0.001, (eB + 1) / (nB + 100));
  return (eA - nA * p) / Math.sqrt(nA * p * (1 - p));
}

export function rankRootCauses(input: RcaInput): RcaResult {
  const w = input.weights ?? DEFAULT_WEIGHTS;
  const onset = Math.min(input.onsetMinute, input.nowMinute);
  const before = input.history.filter((h) => h.minute < onset && h.minute >= onset - BASELINE_MIN);
  const after = input.history.filter((h) => h.minute >= Math.max(onset, input.nowMinute - RECENT_MIN + 1) && h.minute <= input.nowMinute);
  const nodes = [...new Set([...before, ...after].flatMap((h) => Object.keys(h.nodes)))].sort();
  const idx = new Map(nodes.map((n, i) => [n, i]));

  // 1. Self-time and own-error anomaly per node.
  const feats = nodes.map((node) => nodeFeatures(node, before, after));
  const anomaly = feats.map((f) => squash(Math.max(f.zSelf, f.zErr)));

  // Calls between nodes and how anomalous each one became.
  const keys = new Set<string>();
  for (const h of [...before, ...after]) for (const k of Object.keys(h.edges)) keys.add(k);
  const calls: { a: number; b: number; ev: EdgeEvidence }[] = [];
  for (const k of [...keys].sort()) {
    const [a, b] = k.split(">");
    if (a === b || !idx.has(a) || !idx.has(b)) continue;
    calls.push({ a: idx.get(a)!, b: idx.get(b)!, ev: edgeFeatures(k, a, b, before, after) });
  }

  // 2. The blame walk.
  const pr = blameWalk(
    nodes.length,
    calls.map((c) => ({ from: c.a, to: c.b, anomaly: c.ev.anomaly })),
    anomaly,
  );
  const prSelf = blameWalk(
    nodes.length,
    calls.map((c) => ({ from: c.a, to: c.b, anomaly: anomaly[c.b] })),
    anomaly,
  );

  // 3. Where the extra end-to-end time went.
  const cp = criticalPathDiff(input, before, after);

  const prMax = Math.max(...pr, 1e-12);
  const score = (i: number, useCp = true) => w.pagerank * (pr[i] / prMax) + w.anomaly * anomaly[i] + (useCp ? w.criticalPath * (cp.share.get(nodes[i]) ?? 0) : 0);

  const paths = blamePaths(nodes, calls, input.flowRoot);
  const ranking: Candidate[] = nodes.map((node, i) => {
    const inbound = calls.filter((c) => c.b === i).sort((x, y) => y.ev.anomaly - x.ev.anomaly)[0]?.ev;
    return {
      node,
      score: score(i),
      anomaly: anomaly[i],
      ...feats[i],
      pagerank: pr[i],
      cpDeltaMs: cp.delta.get(node) ?? 0,
      cpShare: cp.share.get(node) ?? 0,
      path: paths.get(node) ?? [node],
      inbound,
      version: versionChange(node, before, after),
    };
  });
  const order = (f: (i: number) => number) =>
    nodes
      .map((n, i) => ({ n, v: f(i), t: anomaly[i] }))
      .sort((a, b) => b.v - a.v || b.t - a.t || (a.n < b.n ? -1 : 1))
      .map((x) => x.n);
  ranking.sort((a, b) => b.score - a.score || b.anomaly - a.anomaly || (a.node < b.node ? -1 : 1));
  const prSelfMax = Math.max(...prSelf, 1e-12);

  return {
    flow: input.flow,
    minute: input.nowMinute,
    onsetMinute: onset,
    ranking,
    baselines: {
      highestP99: order((i) => feats[i].p99After),
      p99Jump: order((i) => (feats[i].p99Before > 0 ? feats[i].p99After / feats[i].p99Before : 0)),
      alerting: alertingOrder(input.flowRoot, nodes, after),
    },
    ablations: {
      anomalyOnly: order((i) => anomaly[i] + 1e-3 * Math.max(feats[i].zSelf, feats[i].zErr)),
      pagerankOnly: order((i) => pr[i]),
      noCriticalPath: order((i) => score(i, false)),
      selfOnlyWalk: order((i) => w.pagerank * (prSelf[i] / prSelfMax) + w.anomaly * anomaly[i] + w.criticalPath * (cp.share.get(nodes[i]) ?? 0)),
    },
    traces: { before: cp.nBefore, after: cp.nAfter },
  };
}

function nodeFeatures(node: string, before: MinuteSummary[], after: MinuteSummary[]) {
  const series = (hs: MinuteSummary[]) => hs.map((h) => h.nodes[node]).filter((x) => x && x.n >= 3);
  const b = series(before);
  const a = series(after);
  const logSelfB = b.map((x) => Math.log(Math.max(x.selfMean, 1e-3)));
  const logSelfA = a.map((x) => Math.log(Math.max(x.selfMean, 1e-3)));
  const sum = (xs: typeof b, k: "n" | "own") => xs.reduce((acc, x) => acc + x[k], 0);
  const nB = sum(b, "n");
  const nA = sum(a, "n");
  const eB = sum(b, "own");
  const eA = sum(a, "own");
  const wavg = (xs: typeof b, k: "selfMean" | "durP99") => {
    const n = xs.reduce((acc, x) => acc + x.n, 0);
    return n ? xs.reduce((acc, x) => acc + x[k] * x.n, 0) / n : 0;
  };
  return {
    zSelf: shiftZ(logSelfB, logSelfA, 0.05),
    zErr: errorZ(eB, nB, eA, nA),
    selfBefore: b.length ? Math.exp(median(logSelfB)) : 0,
    selfAfter: wavg(a, "selfMean"),
    ownErrBefore: nB ? eB / nB : 0,
    ownErrAfter: nA ? eA / nA : 0,
    p99Before: b.length ? median(b.map((x) => x.durP99)) : 0,
    p99After: wavg(a, "durP99"),
  };
}

function edgeFeatures(key: string, from: string, to: string, before: MinuteSummary[], after: MinuteSummary[]): EdgeEvidence {
  const b = before.map((h) => h.edges[key]).filter((x) => x && x.n >= 3);
  const a = after.map((h) => h.edges[key]).filter((x) => x && x.n >= 3);
  const lb = b.map((x) => Math.log(Math.max(x.p95, 1e-3)));
  const la = a.map((x) => Math.log(Math.max(x.p95, 1e-3)));
  const nB = b.reduce((s, x) => s + x.n, 0);
  const nA = a.reduce((s, x) => s + x.n, 0);
  const eB = b.reduce((s, x) => s + x.err, 0);
  const eA = a.reduce((s, x) => s + x.err, 0);
  const z = Math.max(shiftZ(lb, la, 0.05), errorZ(eB, nB, eA, nA));
  return {
    from,
    to,
    p95Before: lb.length ? Math.exp(median(lb)) : 0,
    p95After: la.length ? Math.exp(la.reduce((s, x) => s + x, 0) / la.length) : 0,
    errBefore: nB ? eB / nB : 0,
    errAfter: nA ? eA / nA : 0,
    anomaly: squash(z),
  };
}

/**
 * Personalized PageRank for blame. From a node the walker moves to a callee
 * in proportion to how anomalous the call to it became, back to a caller with
 * a small weight, or stays when the node is more anomalous than every call it
 * makes (MonitorRank-style self edge). Restarts land on anomalous nodes.
 */
export function blameWalk(n: number, calls: { from: number; to: number; anomaly: number }[], anomaly: number[], opts = { back: 0.2, epsilon: 0.01 }): number[] {
  const edges: WeightedEdge[] = [];
  const maxOut = new Array(n).fill(0);
  for (const c of calls) maxOut[c.from] = Math.max(maxOut[c.from], c.anomaly);
  for (const c of calls) {
    edges.push({ from: c.from, to: c.to, w: c.anomaly + opts.epsilon });
    edges.push({ from: c.to, to: c.from, w: opts.back * anomaly[c.from] + opts.epsilon * 0.1 });
  }
  for (let i = 0; i < n; i++) edges.push({ from: i, to: i, w: Math.max(0, anomaly[i] - maxOut[i]) + opts.epsilon * 0.1 });
  const personal = anomaly.some((x) => x > 0) ? anomaly : new Array(n).fill(1);
  return Array.from(pageRank(n, edges, personal, { damping: 0.85 }).rank);
}

/** For each node, a path from the flow's root following the most anomalous calls. */
function blamePaths(nodes: string[], calls: { a: number; b: number; ev: EdgeEvidence }[], root: string | null): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const start = root ? nodes.indexOf(root) : -1;
  if (start < 0) return out;
  const prev = new Map<number, { from: number; a: number }>();
  const dist = new Map<number, number>([[start, 0]]);
  const q = [start];
  while (q.length) {
    const u = q.shift()!;
    for (const c of calls) {
      if (c.a !== u) continue;
      const d = dist.get(u)! + 1;
      if (!dist.has(c.b)) {
        dist.set(c.b, d);
        prev.set(c.b, { from: u, a: c.ev.anomaly });
        q.push(c.b);
      } else if (dist.get(c.b) === d && c.ev.anomaly > prev.get(c.b)!.a) prev.set(c.b, { from: u, a: c.ev.anomaly });
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    if (!dist.has(i)) continue;
    const p = [nodes[i]];
    let c = i;
    while (prev.has(c)) {
      c = prev.get(c)!.from;
      p.unshift(nodes[c]);
    }
    out.set(nodes[i], p);
  }
  return out;
}

function alertingOrder(root: string | null, nodes: string[], after: MinuteSummary[]): string[] {
  // The on-call reflex: start at the alerting service, then its busiest callees.
  const vol = new Map<string, number>();
  for (const h of after)
    for (const [k, e] of Object.entries(h.edges)) {
      const [a, b] = k.split(">");
      if (a === root) vol.set(b, (vol.get(b) ?? 0) + e.n);
    }
  const rest = nodes.filter((n) => n !== root).sort((a, b) => (vol.get(b) ?? 0) - (vol.get(a) ?? 0) || (a < b ? -1 : 1));
  return root && nodes.includes(root) ? [root, ...rest] : rest;
}

function versionChange(node: string, before: MinuteSummary[], after: MinuteSummary[]): Candidate["version"] {
  const count = (hs: MinuteSummary[]) => {
    const m = new Map<string, number>();
    for (const h of hs) for (const [v, c] of Object.entries(h.nodes[node]?.versions ?? {})) m.set(v, (m.get(v) ?? 0) + c);
    return m;
  };
  const b = count(before);
  const a = count(after);
  const totA = [...a.values()].reduce((x, y) => x + y, 0);
  const totB = [...b.values()].reduce((x, y) => x + y, 0);
  if (!totA || !totB) return undefined;
  let best: { to: string; share: number } | undefined;
  for (const [v, c] of a) {
    const shareB = (b.get(v) ?? 0) / totB;
    const share = c / totA;
    if (shareB < 0.02 && share > 0.05 && (!best || share > best.share)) best = { to: v, share };
  }
  if (!best) return undefined;
  const from = [...b.entries()].sort((x, y) => y[1] - x[1])[0][0];
  return { from, to: best.to, share: best.share };
}

const cpCache = new WeakMap<StoredTrace, Map<string, number>>();

/** Critical-path ms per node for one stored trace; for an async flow, the consumer's lag and processing. */
export function traceCriticalPath(t: StoredTrace, asyncService?: string): Map<string, number> {
  if (!asyncService) {
    const hit = cpCache.get(t);
    if (hit) return hit;
  }
  const tree = buildTree(t.spans);
  const m = new Map<string, number>();
  const add = (node: string, ns: number) => m.set(node, (m.get(node) ?? 0) + ns / 1e6);
  if (asyncService) {
    for (const n of tree.nodes) {
      if (n.span.kind !== Kind.CONSUMER || n.span.service !== asyncService) continue;
      const q = n.span.attributes["tw.enqueued_ns"];
      if (typeof q === "number") add(n.node, Math.max(0, n.span.startNs - q));
      for (const s of criticalPath(tree, n)) add(s.span.node, s.endNs - s.startNs);
    }
  } else {
    for (const s of criticalPath(tree)) add(s.span.node, s.endNs - s.startNs);
    cpCache.set(t, m);
  }
  return m;
}

interface CpDiff {
  delta: Map<string, number>;
  share: Map<string, number>;
  nBefore: number;
  nAfter: number;
}

/**
 * Per flow, the weighted mean critical-path time per node before and after;
 * the differences are scaled by each flow's request rate and summed, giving
 * extra milliseconds of waiting per second of traffic, by node.
 */
function criticalPathDiff(input: RcaInput, before: MinuteSummary[], after: MinuteSummary[]): CpDiff {
  const out: CpDiff = { delta: new Map(), share: new Map(), nBefore: 0, nAfter: 0 };
  const incident = input.flows.find((f) => f.id === input.flow);
  const flows = input.flows.filter((f) => !f.async || f === incident);
  const minutesB = new Set(before.map((h) => h.minute));
  const minutesA = new Set(after.map((h) => h.minute));
  let baseTotal = 0;
  for (const cfg of flows) {
    // Sampled traces stand for all the ordinary traces of their minute.
    const weightOf = new Map<number, number>();
    for (const h of [...before, ...after]) {
      const f = h.flows[cfg.id];
      if (f && f.restKept > 0) weightOf.set(h.minute, f.restSeen / f.restKept);
    }
    const acc = (minutes: Set<number>) => {
      const sum = new Map<string, number>();
      let wsum = 0;
      let n = 0;
      for (const t of input.store) {
        if (!minutes.has(t.minute) || t.partial) continue;
        if (cfg.async ? !t.spans.some((s) => s.kind === Kind.CONSUMER && s.service === cfg.root) : t.flow !== cfg.id) continue;
        const w = t.reason === "sampled" && !cfg.async ? (weightOf.get(t.minute) ?? 1) : 1;
        for (const [node, ms] of traceCriticalPath(t, cfg.async ? cfg.root : undefined)) sum.set(node, (sum.get(node) ?? 0) + w * ms);
        wsum += w;
        n++;
      }
      for (const [k, v] of sum) sum.set(k, v / Math.max(wsum, 1e-9));
      return { mean: sum, n };
    };
    const b = acc(minutesB);
    const a = acc(minutesA);
    out.nBefore += b.n;
    out.nAfter += a.n;
    if (b.n < 5 || a.n < 3) continue;
    const ratePerSec = after.reduce((s, h) => s + (h.flows[cfg.id]?.n ?? 0), 0) / Math.max(1, after.length) / 60;
    for (const k of new Set([...a.mean.keys(), ...b.mean.keys()])) {
      const d = ((a.mean.get(k) ?? 0) - (b.mean.get(k) ?? 0)) * ratePerSec;
      out.delta.set(k, (out.delta.get(k) ?? 0) + d);
    }
    for (const v of b.mean.values()) baseTotal += v * ratePerSec;
  }
  let pos = 0;
  for (const d of out.delta.values()) pos += Math.max(0, d);
  // Growth under 10% of the usual end-to-end time is weak evidence.
  const confidence = Math.min(1, pos / Math.max(0.1 * baseTotal, 1e-9));
  if (pos > 0) for (const [k, d] of out.delta) out.share.set(k, (Math.max(0, d) / pos) * confidence);
  return out;
}
