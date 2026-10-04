// Span trees: parent/child assembly, exclusive (self) time, which service-map
// node each span's time belongs to, and the critical path.

import { Kind, Status, type Span } from "./types";

export interface TraceNode {
  span: Span;
  parent: TraceNode | null;
  children: TraceNode[];
  /** Service-map node this span's time is attributed to. */
  node: string;
  /** Exclusive time: duration minus the union of its children's intervals. */
  selfNs: number;
  depth: number;
}

export interface TraceTree {
  traceId: string;
  root: TraceNode;
  /** Usually one; spans whose parent never arrived become extra roots. */
  roots: TraceNode[];
  nodes: TraceNode[];
  byId: Map<string, TraceNode>;
  startNs: number;
  endNs: number;
}

/**
 * The node a span's time belongs to. A CLIENT span is time spent waiting on
 * the callee, so it is attributed to the callee: the instrumented service
 * whose SERVER span is its child, or else the peer it names (a database,
 * cache or external API that emits no spans of its own).
 */
export function spanNode(span: Span, children: readonly TraceNode[] | readonly Span[]): string {
  if (span.kind !== Kind.CLIENT) return span.service;
  for (const c of children) {
    const s = "span" in c ? c.span : c;
    if (s.kind === Kind.SERVER || s.kind === Kind.CONSUMER) return s.service;
  }
  const a = span.attributes;
  const peer = a["peer.service"] ?? a["db.system"] ?? a["server.address"] ?? a["net.peer.name"] ?? a["rpc.service"];
  return typeof peer === "string" && peer ? peer : span.service;
}

/** Length of the union of [s, e) intervals clipped to [lo, hi). */
export function unionLength(intervals: [number, number][], lo: number, hi: number): number {
  const xs = intervals
    .map(([s, e]) => [Math.max(s, lo), Math.min(e, hi)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cs = -Infinity;
  let ce = -Infinity;
  for (const [s, e] of xs) {
    if (s > ce) {
      if (ce > cs) total += ce - cs;
      cs = s;
      ce = e;
    } else if (e > ce) ce = e;
  }
  if (ce > cs) total += ce - cs;
  return total;
}

export function exclusiveNs(span: Span, children: readonly Span[]): number {
  const d = span.endNs - span.startNs;
  if (!children.length) return d;
  return d - unionLength(children.map((c) => [c.startNs, c.endNs]), span.startNs, span.endNs);
}

export function buildTree(spans: readonly Span[]): TraceTree {
  if (!spans.length) throw new Error("empty trace");
  const byId = new Map<string, TraceNode>();
  const nodes: TraceNode[] = [];
  for (const span of spans) {
    const n: TraceNode = { span, parent: null, children: [], node: span.service, selfNs: 0, depth: 0 };
    byId.set(span.spanId, n);
    nodes.push(n);
  }
  const roots: TraceNode[] = [];
  for (const n of nodes) {
    const p = n.span.parentSpanId ? byId.get(n.span.parentSpanId) : undefined;
    if (p && p !== n) {
      n.parent = p;
      p.children.push(n);
    } else roots.push(n);
  }
  for (const n of nodes) n.children.sort((a, b) => a.span.startNs - b.span.startNs || (a.span.spanId < b.span.spanId ? -1 : 1));
  roots.sort((a, b) => a.span.startNs - b.span.startNs || b.span.endNs - a.span.endNs);
  let startNs = Infinity;
  let endNs = -Infinity;
  // Depth-first so depth is set top-down and attribution sees children.
  const stack = [...roots];
  for (const r of roots) r.depth = 0;
  while (stack.length) {
    const n = stack.pop()!;
    n.node = spanNode(n.span, n.children);
    n.selfNs = exclusiveNs(
      n.span,
      n.children.map((c) => c.span),
    );
    if (n.span.startNs < startNs) startNs = n.span.startNs;
    if (n.span.endNs > endNs) endNs = n.span.endNs;
    for (const c of n.children) {
      c.depth = n.depth + 1;
      stack.push(c);
    }
  }
  nodes.sort((a, b) => a.span.startNs - b.span.startNs || a.depth - b.depth);
  // Prefer a real root (no parent id) over an orphan as the trace's root.
  const root = roots.find((r) => !r.span.parentSpanId) ?? roots[0];
  return { traceId: spans[0].traceId, root, roots, nodes, byId, startNs, endNs };
}

/**
 * One request handled by one node: a span whose parent belongs to a different
 * node (or has none), together with the same-node spans beneath it.
 */
export interface Entry {
  node: string;
  parentNode: string | null;
  span: TraceNode;
  /** Exclusive time summed over the same-node spans of this request. */
  selfNs: number;
  durNs: number;
  error: boolean;
  /** An error that started here: some span of this request failed while none of its children did. */
  ownError: boolean;
  version?: string;
}

/**
 * A cancellation is the caller's decision (it timed out or was cancelled
 * itself), so it is never the cancelled span's own failure.
 */
export function isCancellation(s: Span): boolean {
  return s.statusMessage === "CANCELLED" || s.attributes["rpc.grpc.status_code"] === 1 || s.attributes["error.type"] === "cancelled";
}

/** A failure that started at this span: it errored, and none of its children failed on their own account. */
export function isOwnError(n: TraceNode): boolean {
  return n.span.status === Status.ERROR && !isCancellation(n.span) && !n.children.some((c) => c.span.status === Status.ERROR && !isCancellation(c.span));
}

export function entries(tree: TraceTree): Entry[] {
  const out: Entry[] = [];
  for (const n of tree.nodes) {
    if (n.parent && n.parent.node === n.node) continue;
    let self = 0;
    let own = false;
    // The node's own version: from its own spans, not from the caller's CLIENT span.
    let version: string | undefined;
    const stack = [n];
    while (stack.length) {
      const m = stack.pop()!;
      self += m.selfNs;
      if (!own && isOwnError(m)) own = true;
      if (!version && m.span.version && m.span.service === n.node) version = m.span.version;
      for (const c of m.children) if (c.node === n.node) stack.push(c);
    }
    out.push({
      node: n.node,
      parentNode: n.parent ? n.parent.node : null,
      span: n,
      selfNs: self,
      durNs: n.span.endNs - n.span.startNs,
      error: n.span.status === Status.ERROR,
      ownError: own,
      version,
    });
  }
  return out;
}

export interface Segment {
  span: TraceNode;
  startNs: number;
  endNs: number;
}

/**
 * The critical path: the chain of work that set the trace's end-to-end
 * latency. Walking backwards from the end, a span's time belongs to the path
 * until the child that finished last; then the path descends into that child
 * and continues from where it started. Children are clipped to their parent,
 * so asynchronous work that outlives the request is not on its path.
 * Segment lengths add up to the root's duration.
 */
export function criticalPath(tree: TraceTree, from: TraceNode = tree.root): Segment[] {
  const out: Segment[] = [];
  walk(from, from.span.startNs, from.span.endNs, out);
  return out.reverse();
}

function walk(n: TraceNode, lo: number, hi: number, out: Segment[]): void {
  let cursor = hi;
  // Children by clipped end, latest first.
  const kids = n.children
    .map((c) => ({ c, s: Math.max(c.span.startNs, lo), e: Math.min(c.span.endNs, hi) }))
    .filter((k) => k.e > k.s)
    .sort((a, b) => b.e - a.e || a.s - b.s);
  let i = 0;
  while (i < kids.length && cursor > lo) {
    // The last child to finish at or before the cursor.
    while (i < kids.length && kids[i].e > cursor) i++;
    if (i >= kids.length) break;
    const k = kids[i++];
    if (cursor > k.e) out.push({ span: n, startNs: k.e, endNs: cursor });
    walk(k.c, k.s, k.e, out);
    cursor = k.s;
  }
  if (cursor > lo) out.push({ span: n, startNs: lo, endNs: cursor });
}

/** Critical-path time per node, in ns. */
export function criticalPathByNode(tree: TraceTree): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of criticalPath(tree)) m.set(s.span.node, (m.get(s.span.node) ?? 0) + s.endNs - s.startNs);
  return m;
}
