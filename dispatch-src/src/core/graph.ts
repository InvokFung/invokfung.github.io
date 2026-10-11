// Road graph in compressed sparse rows, Dijkstra with a binary heap, and
// all-pairs shortest paths by running Dijkstra from every node. The city has
// a few hundred intersections, so the full matrix is small (n² doubles) and
// every travel-time lookup in the solver is one array read.

export interface Edge {
  a: number;
  b: number;
  /** Free-flow minutes. */
  w: number;
}

export interface Graph {
  n: number;
  start: Int32Array;
  to: Int32Array;
  w: Float64Array;
}

/** Undirected graph: each edge is stored in both directions. */
export function buildGraph(n: number, edges: readonly Edge[]): Graph {
  const deg = new Int32Array(n);
  for (const e of edges) {
    deg[e.a]++;
    deg[e.b]++;
  }
  const start = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + deg[i];
  const fill = start.slice(0, n);
  const to = new Int32Array(start[n]);
  const w = new Float64Array(start[n]);
  for (const e of edges) {
    to[fill[e.a]] = e.b;
    w[fill[e.a]++] = e.w;
    to[fill[e.b]] = e.a;
    w[fill[e.b]++] = e.w;
  }
  return { n, start, to, w };
}

/** Min-heap of (key, node) with lazy deletion: stale entries are skipped when popped. */
class Heap {
  keys: Float64Array;
  vals: Int32Array;
  size = 0;
  constructor(cap: number) {
    this.keys = new Float64Array(cap);
    this.vals = new Int32Array(cap);
  }
  push(k: number, v: number) {
    if (this.size === this.keys.length) {
      const k2 = new Float64Array(this.size * 2);
      k2.set(this.keys);
      const v2 = new Int32Array(this.size * 2);
      v2.set(this.vals);
      this.keys = k2;
      this.vals = v2;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= k) break;
      this.keys[i] = this.keys[p];
      this.vals[i] = this.vals[p];
      i = p;
    }
    this.keys[i] = k;
    this.vals[i] = v;
  }
  /** Pops the minimum; returns its node, and its key in `this.top`. */
  top = 0;
  pop(): number {
    const v = this.vals[0];
    this.top = this.keys[0];
    const k = this.keys[--this.size];
    const x = this.vals[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= k) break;
      this.keys[i] = this.keys[c];
      this.vals[i] = this.vals[c];
      i = c;
    }
    this.keys[i] = k;
    this.vals[i] = x;
    return v;
  }
}

/** Single-source shortest paths. `pred[v]` is the node before v on the path from src (-1 for src and unreachable nodes). */
export function dijkstra(g: Graph, src: number, dist: Float64Array, pred: Int32Array): void {
  dist.fill(Infinity);
  pred.fill(-1);
  dist[src] = 0;
  const heap = new Heap(g.n * 2);
  heap.push(0, src);
  while (heap.size > 0) {
    const u = heap.pop();
    const du = heap.top;
    if (du > dist[u]) continue;
    for (let e = g.start[u]; e < g.start[u + 1]; e++) {
      const v = g.to[e];
      const nd = du + g.w[e];
      if (nd < dist[v]) {
        dist[v] = nd;
        pred[v] = u;
        heap.push(nd, v);
      }
    }
  }
}

export interface AllPairs {
  n: number;
  /** dist[a * n + b], free-flow minutes. */
  dist: Float64Array;
  /** pred[a * n + b]: the node before b on the shortest path from a. */
  pred: Int32Array;
}

export function allPairs(g: Graph): AllPairs {
  const n = g.n;
  const dist = new Float64Array(n * n);
  const pred = new Int32Array(n * n);
  const d = new Float64Array(n);
  const p = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    dijkstra(g, s, d, p);
    dist.set(d, s * n);
    pred.set(p, s * n);
  }
  return { n, dist, pred };
}

/** The node sequence of the shortest path from a to b, both ends included. */
export function pathBetween(ap: AllPairs, a: number, b: number): number[] {
  if (a === b) return [a];
  const out = [b];
  let v = b;
  const base = a * ap.n;
  while (v !== a) {
    v = ap.pred[base + v];
    if (v < 0) return [];
    out.push(v);
  }
  return out.reverse();
}
