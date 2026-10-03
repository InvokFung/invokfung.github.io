// Batch analysis of a set of spans, such as an uploaded OTLP file: assemble
// each trace, then RED metrics per service-map node and per call edge, with
// the same span-tree, exclusive-time and sketch code the live pipeline uses.

import { DDSketch } from "./sketch";
import { buildTree, entries, criticalPath, type TraceTree } from "./tracetree";
import { Status, type Span } from "./types";

export interface ServiceRed {
  node: string;
  /** Requests handled (entries into this node). */
  n: number;
  err: number;
  ownErr: number;
  rps: number;
  selfMean: number;
  p50: number;
  p95: number;
  p99: number;
  /** Seen only through its callers' CLIENT spans. */
  inferred: boolean;
}

export interface EdgeRed {
  from: string;
  to: string;
  n: number;
  err: number;
  p95: number;
}

export interface TraceRow {
  traceId: string;
  root: string;
  service: string;
  startNs: number;
  durMs: number;
  spans: number;
  error: boolean;
  nodes: number;
}

export interface BatchAnalysis {
  spans: number;
  traces: TraceRow[];
  services: ServiceRed[];
  edges: EdgeRed[];
  spanMs: number;
}

export function groupByTrace(spans: readonly Span[]): Map<string, Span[]> {
  const m = new Map<string, Span[]>();
  for (const s of spans) (m.get(s.traceId) ?? m.set(s.traceId, []).get(s.traceId)!).push(s);
  return m;
}

export function analyzeSpans(spans: readonly Span[]): BatchAnalysis {
  const groups = groupByTrace(spans);
  const nodes = new Map<string, { n: number; err: number; own: number; self: number; dur: DDSketch; inferred: boolean }>();
  const edges = new Map<string, { n: number; err: number; dur: DDSketch }>();
  const traces: TraceRow[] = [];
  // A node is inferred when no span names it as its own service.
  const emitting = new Set(spans.map((s) => s.service));
  let lo = Infinity;
  let hi = -Infinity;
  for (const [traceId, group] of groups) {
    const tree = buildTree(group);
    lo = Math.min(lo, tree.startNs);
    hi = Math.max(hi, tree.endNs);
    const ents = entries(tree);
    for (const e of ents) {
      let a = nodes.get(e.node);
      if (!a) nodes.set(e.node, (a = { n: 0, err: 0, own: 0, self: 0, dur: new DDSketch(), inferred: !emitting.has(e.node) }));
      a.n++;
      if (e.error) a.err++;
      if (e.ownError) a.own++;
      a.self += e.selfNs / 1e6;
      a.dur.add(e.durNs / 1e6);
      if (e.parentNode !== null) {
        const k = `${e.parentNode}>${e.node}`;
        let ed = edges.get(k);
        if (!ed) edges.set(k, (ed = { n: 0, err: 0, dur: new DDSketch() }));
        ed.n++;
        if (e.error) ed.err++;
        ed.dur.add(e.durNs / 1e6);
      }
    }
    const root = tree.root.span;
    traces.push({
      traceId,
      root: root.name,
      service: root.service,
      startNs: tree.startNs,
      durMs: (tree.endNs - tree.startNs) / 1e6,
      spans: group.length,
      error: group.some((s) => s.status === Status.ERROR),
      nodes: new Set(ents.map((e) => e.node)).size,
    });
  }
  const spanMs = Math.max(1, (hi - lo) / 1e6);
  traces.sort((a, b) => a.startNs - b.startNs);
  return {
    spans: spans.length,
    traces,
    spanMs,
    services: [...nodes]
      .map(([node, a]) => ({
        node,
        n: a.n,
        err: a.err,
        ownErr: a.own,
        rps: a.n / (spanMs / 1000),
        selfMean: a.self / a.n,
        p50: a.dur.quantile(0.5),
        p95: a.dur.quantile(0.95),
        p99: a.dur.quantile(0.99),
        inferred: a.inferred,
      }))
      .sort((a, b) => b.n - a.n || (a.node < b.node ? -1 : 1)),
    edges: [...edges].map(([k, e]) => {
      const [from, to] = k.split(">");
      return { from, to, n: e.n, err: e.err, p95: e.dur.quantile(0.95) };
    }),
  };
}

export interface WaterfallSpan {
  spanId: string;
  parentSpanId: string;
  name: string;
  service: string;
  node: string;
  kind: number;
  depth: number;
  startMs: number;
  durMs: number;
  selfMs: number;
  error: boolean;
  statusMessage?: string;
  version?: string;
  attributes: Record<string, string | number | boolean>;
  /** Time this span spends on the critical path, ms. */
  criticalMs: number;
  /** Critical-path segments within the span, relative ms. */
  critical: [number, number][];
}

export interface Waterfall {
  traceId: string;
  durMs: number;
  spans: WaterfallSpan[];
  /** Critical-path ms by node. */
  byNode: { node: string; ms: number }[];
}

/** A trace laid out for display: depth-first order, times in ms from the root's start, critical path marked. */
export function waterfall(spans: readonly Span[]): Waterfall {
  const tree: TraceTree = buildTree(spans);
  const t0 = tree.startNs;
  const cp = criticalPath(tree);
  const segs = new Map<string, [number, number][]>();
  const byNode = new Map<string, number>();
  for (const s of cp) {
    const id = s.span.span.spanId;
    (segs.get(id) ?? segs.set(id, []).get(id)!).push([(s.startNs - t0) / 1e6, (s.endNs - t0) / 1e6]);
    byNode.set(s.span.node, (byNode.get(s.span.node) ?? 0) + (s.endNs - s.startNs) / 1e6);
  }
  const out: WaterfallSpan[] = [];
  const visit = (n: TraceTree["root"]) => {
    const s = n.span;
    const crit = segs.get(s.spanId) ?? [];
    out.push({
      spanId: s.spanId,
      parentSpanId: s.parentSpanId,
      name: s.name,
      service: s.service,
      node: n.node,
      kind: s.kind,
      depth: n.depth,
      startMs: (s.startNs - t0) / 1e6,
      durMs: (s.endNs - s.startNs) / 1e6,
      selfMs: n.selfNs / 1e6,
      error: s.status === Status.ERROR,
      statusMessage: s.statusMessage,
      version: s.version,
      attributes: s.attributes,
      criticalMs: crit.reduce((a, [x, y]) => a + y - x, 0),
      critical: crit,
    });
    for (const c of n.children) visit(c);
  };
  for (const r of tree.roots) visit(r);
  return {
    traceId: tree.traceId,
    durMs: (tree.endNs - tree.startNs) / 1e6,
    spans: out,
    byNode: [...byNode].map(([node, ms]) => ({ node, ms })).sort((a, b) => b.ms - a.ms),
  };
}
