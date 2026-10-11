// A synthetic city: a jittered street grid with its corners rounded off, a few
// faster arterials, and a river that can only be crossed at five bridges.
// Free-flow travel times between every pair of intersections come from
// Dijkstra on that network. Synthetic, generated from a seed.

import { allPairs, buildGraph, type AllPairs, type Edge, type Graph } from "./graph";
import { Rng } from "./rng";

export const CITY_SEED = "harbour-city";

export type RoadClass = 0 | 1 | 2; // street, arterial, bridge

export interface Road {
  a: number;
  b: number;
  cls: RoadClass;
  km: number;
  /** Free-flow minutes. */
  min: number;
}

export interface City {
  seed: string;
  /** Kilometres. */
  width: number;
  height: number;
  xs: Float64Array;
  ys: Float64Array;
  roads: Road[];
  /** River centre line, west to east, in km. */
  river: [number, number][];
  riverWidth: number;
  depots: { node: number; name: string }[];
  graph: Graph;
  ap: AllPairs;
}

const COLS = 28;
const ROWS = 18;
const SPACING = 0.6; // km between grid lines
const STREET_KMH = 26;
const ARTERIAL_KMH = 42;
const ARTERIAL_COLS = new Set([4, 13, 22]);
const ARTERIAL_ROWS = new Set([3, 15]);
const BRIDGE_COLS = [4, 9, 13, 18, 22];

export function generateCity(seed = CITY_SEED): City {
  const rng = new Rng(`city:${seed}`);
  const width = (COLS - 1) * SPACING;
  const height = (ROWS - 1) * SPACING;
  const phase = rng.uniform(0, Math.PI * 2);
  const riverY = (x: number) => height * 0.53 + 1.0 * Math.sin((x / width) * Math.PI * 1.7 + phase) + 0.35 * Math.sin((x / width) * Math.PI * 4.3 + phase * 1.7);

  // grid nodes, jittered, outside a rounded boundary dropped
  const keep: boolean[] = [];
  const gx: number[] = [];
  const gy: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const onArtery = ARTERIAL_COLS.has(c) || ARTERIAL_ROWS.has(r);
      const j = onArtery ? 0.06 : 0.16;
      const x = c * SPACING + rng.uniform(-j, j) * SPACING;
      const y = r * SPACING + rng.uniform(-j, j) * SPACING;
      gx.push(x);
      gy.push(y);
      const dx = (x - width / 2) / (width / 2);
      const dy = (y - height / 2) / (height / 2);
      const rr = Math.pow(Math.abs(dx), 2.6) + Math.pow(Math.abs(dy), 2.6);
      keep.push(rr <= 1.0 + rng.uniform(-0.12, 0.12));
    }
  }
  const id = (r: number, c: number) => r * COLS + c;
  const index = new Int32Array(ROWS * COLS).fill(-1);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < keep.length; i++) {
    if (!keep[i]) continue;
    index[i] = xs.length;
    xs.push(gx[i]);
    ys.push(gy[i]);
  }
  const n = xs.length;

  const side = (k: number) => Math.sign(ys[k] - riverY(xs[k]));
  type Cand = { a: number; b: number; cls: RoadClass; col: number; vertical: boolean };
  const cands: Cand[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const a = index[id(r, c)];
      if (a < 0) continue;
      if (c + 1 < COLS) {
        const b = index[id(r, c + 1)];
        if (b >= 0) cands.push({ a, b, cls: ARTERIAL_ROWS.has(r) ? 1 : 0, col: c, vertical: false });
      }
      if (r + 1 < ROWS) {
        const b = index[id(r + 1, c)];
        if (b >= 0) cands.push({ a, b, cls: ARTERIAL_COLS.has(c) ? 1 : 0, col: c, vertical: true });
      }
    }
  }

  // the river: edges that cross it go, except one vertical crossing on each bridge column
  const bridged = new Set<number>();
  const kept: Cand[] = [];
  for (const e of cands) {
    if (side(e.a) === side(e.b)) {
      kept.push(e);
      continue;
    }
    if (e.vertical && BRIDGE_COLS.includes(e.col) && !bridged.has(e.col)) {
      bridged.add(e.col);
      kept.push({ ...e, cls: 2 });
    }
  }

  // knock out a few street segments for irregular blocks, keeping the graph connected
  const removable = kept.map((e, i) => (e.cls === 0 ? i : -1)).filter((i) => i >= 0);
  rng.shuffle(removable);
  const removed = new Set(removable.slice(0, Math.floor(removable.length * 0.07)));
  const connected = (skip: Set<number>) => {
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    let comps = n;
    kept.forEach((e, i) => {
      if (skip.has(i)) return;
      const ra = find(e.a);
      const rb = find(e.b);
      if (ra !== rb) {
        parent[ra] = rb;
        comps--;
      }
    });
    return comps === 1;
  };
  for (const i of [...removed]) {
    if (!connected(removed)) removed.delete(i);
  }
  if (!connected(removed)) throw new Error("city graph is disconnected");

  // drop intersections left with no roads (can happen on the boundary)
  const roadsRaw = kept.filter((_, i) => !removed.has(i));
  const deg = new Int32Array(n);
  for (const e of roadsRaw) {
    deg[e.a]++;
    deg[e.b]++;
  }
  const remap = new Int32Array(n).fill(-1);
  const X: number[] = [];
  const Y: number[] = [];
  for (let i = 0; i < n; i++) {
    if (deg[i] === 0) continue;
    remap[i] = X.length;
    X.push(xs[i]);
    Y.push(ys[i]);
  }
  const roads: Road[] = roadsRaw.map((e) => {
    const a = remap[e.a];
    const b = remap[e.b];
    const km = Math.hypot(X[a] - X[b], Y[a] - Y[b]);
    const kmh = e.cls === 1 || (e.cls === 2 && (ARTERIAL_COLS.has(e.col) || !e.vertical)) ? ARTERIAL_KMH : STREET_KMH;
    return { a, b, cls: e.cls, km, min: (km / kmh) * 60 };
  });
  const N = X.length;
  const graph = buildGraph(
    N,
    roads.map((r): Edge => ({ a: r.a, b: r.b, w: r.min })),
  );
  const ap = allPairs(graph);

  const river: [number, number][] = [];
  for (let i = 0; i <= 80; i++) {
    const x = -0.6 + ((width + 1.2) * i) / 80;
    river.push([x, riverY(x)]);
  }

  const nearest = (x: number, y: number) => {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < N; i++) {
      const d = (X[i] - x) ** 2 + (Y[i] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };
  const depots = [
    { node: nearest(width * 0.3, height * 0.24), name: "North depot" },
    { node: nearest(width * 0.68, height * 0.8), name: "South depot" },
  ];

  return { seed, width, height, xs: Float64Array.from(X), ys: Float64Array.from(Y), roads, river, riverWidth: 0.32, depots, graph, ap };
}

/** Nearest intersection to a point, in km. */
export function nearestNode(city: City, x: number, y: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < city.xs.length; i++) {
    const d = (city.xs[i] - x) ** 2 + (city.ys[i] - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
