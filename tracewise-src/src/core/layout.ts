// Layered (Sugiyama-style) graph layout for the service map: longest-path
// layers, dummy nodes on long edges, barycenter ordering to cut crossings,
// then positions relaxed towards their neighbours. Small and deterministic:
// the map has a dozen nodes, so clarity beats asymptotics.

export interface LayoutInput {
  nodes: string[];
  edges: { from: string; to: string }[];
}

export interface Point {
  x: number;
  y: number;
}

export interface LaidOutNode extends Point {
  id: string;
  layer: number;
  order: number;
}

export interface LaidOutEdge {
  from: string;
  to: string;
  /** From the source node's centre through any bend points to the target's centre. */
  points: Point[];
}

export interface Layout {
  nodes: Map<string, LaidOutNode>;
  edges: LaidOutEdge[];
  layers: number;
  crossings: number;
}

export interface LayoutOptions {
  width: number;
  height: number;
  /** Layers run top to bottom instead of left to right. */
  vertical: boolean;
  /** Margin around the drawing, px. */
  pad: number;
  /** Ordering sweeps. */
  sweeps?: number;
}

interface Item {
  id: string;
  dummy: boolean;
  layer: number;
  pos: number;
  /** Neighbours in the layer above and below. */
  up: Item[];
  down: Item[];
}

/** Longest path from the sources; edges that would close a cycle are ignored. */
export function assignLayers(nodes: string[], edges: { from: string; to: string }[]): Map<string, number> {
  const out = new Map<string, string[]>(nodes.map((n) => [n, []]));
  const state = new Map<string, 0 | 1 | 2>();
  const acyclic: { from: string; to: string }[] = [];
  const visit = (n: string) => {
    state.set(n, 1);
    for (const e of edges) {
      if (e.from !== n || !out.has(e.to)) continue;
      const s = state.get(e.to) ?? 0;
      if (s === 1) continue; // back edge
      acyclic.push(e);
      if (s === 0) visit(e.to);
    }
    state.set(n, 2);
  };
  for (const n of nodes) if (!state.get(n)) visit(n);
  for (const e of acyclic) out.get(e.from)!.push(e.to);
  const layer = new Map<string, number>();
  const depth = (n: string, seen = new Set<string>()): number => {
    if (layer.has(n)) return layer.get(n)!;
    seen.add(n);
    let d = 0;
    for (const [from, tos] of out) if (tos.includes(n) && !seen.has(from)) d = Math.max(d, depth(from, seen) + 1);
    seen.delete(n);
    layer.set(n, d);
    return d;
  };
  for (const n of nodes) depth(n);
  return layer;
}

/** Number of crossing edge pairs between two adjacent layers. */
function crossingsBetween(upper: Item[]): number {
  const pairs: [number, number][] = [];
  for (const u of upper) for (const d of u.down) pairs.push([u.pos, d.pos]);
  let c = 0;
  for (let i = 0; i < pairs.length; i++)
    for (let j = i + 1; j < pairs.length; j++) {
      const [a1, b1] = pairs[i];
      const [a2, b2] = pairs[j];
      if ((a1 - a2) * (b1 - b2) < 0) c++;
    }
  return c;
}

function totalCrossings(layers: Item[][]): number {
  let c = 0;
  for (let i = 0; i + 1 < layers.length; i++) c += crossingsBetween(layers[i]);
  return c;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function layout(input: LayoutInput, opts: LayoutOptions): Layout {
  const layerOf = assignLayers(input.nodes, input.edges);
  const nLayers = Math.max(0, ...layerOf.values()) + 1;
  const items = new Map<string, Item>();
  const layers: Item[][] = Array.from({ length: nLayers }, () => []);
  const add = (id: string, layer: number, dummy: boolean) => {
    const it: Item = { id, dummy, layer, pos: layers[layer].length, up: [], down: [] };
    items.set(id, it);
    layers[layer].push(it);
    return it;
  };
  for (const n of input.nodes) add(n, layerOf.get(n)!, false);

  // Edges spanning several layers get a dummy per layer they cross.
  const chains: { from: string; to: string; ids: string[] }[] = [];
  for (const e of input.edges) {
    const a = items.get(e.from);
    const b = items.get(e.to);
    if (!a || !b || a === b) continue;
    const [top, bottom, flipped] = a.layer < b.layer ? [a, b, false] : [b, a, true];
    if (top.layer === bottom.layer) continue;
    const ids = [top.id];
    let prev = top;
    for (let l = top.layer + 1; l < bottom.layer; l++) {
      const d = add(`${e.from}>${e.to}#${l}`, l, true);
      prev.down.push(d);
      d.up.push(prev);
      ids.push(d.id);
      prev = d;
    }
    prev.down.push(bottom);
    bottom.up.push(prev);
    ids.push(bottom.id);
    chains.push({ from: e.from, to: e.to, ids: flipped ? ids.reverse() : ids });
  }

  // Barycenter sweeps, keeping the best ordering seen.
  const snapshot = () => layers.map((l) => l.map((it) => it.id));
  const renumber = (l: Item[]) => l.forEach((it, i) => (it.pos = i));
  let best = snapshot();
  let bestC = totalCrossings(layers);
  const sweeps = opts.sweeps ?? 12;
  for (let s = 0; s < sweeps && bestC > 0; s++) {
    const downward = s % 2 === 0;
    const order = downward ? layers.map((_, i) => i).slice(1) : layers.map((_, i) => i).slice(0, -1).reverse();
    for (const li of order) {
      const l = layers[li];
      const bary = new Map(l.map((it) => {
        const nb = downward ? it.up : it.down;
        return [it, nb.length ? mean(nb.map((x) => x.pos)) : it.pos] as const;
      }));
      l.sort((x, y) => bary.get(x)! - bary.get(y)! || x.pos - y.pos);
      renumber(l);
    }
    const c = totalCrossings(layers);
    if (c < bestC) {
      bestC = c;
      best = snapshot();
    }
  }
  best.forEach((ids, li) => {
    layers[li] = ids.map((id) => items.get(id)!);
    renumber(layers[li]);
  });

  // Cross-axis positions in units, for the real nodes first: one unit apart
  // within a layer, relaxed towards the nodes they call and are called by.
  const coord = new Map<Item, number>();
  const realLayers = layers.map((l) => l.filter((it) => !it.dummy));
  const neighbours = new Map<Item, Item[]>();
  for (const c of chains) {
    const a = items.get(c.ids[0])!;
    const b = items.get(c.ids[c.ids.length - 1])!;
    (neighbours.get(a) ?? neighbours.set(a, []).get(a)!).push(b);
    (neighbours.get(b) ?? neighbours.set(b, []).get(b)!).push(a);
  }
  for (const l of realLayers) l.forEach((it, i) => coord.set(it, i - (l.length - 1) / 2));
  for (let iter = 0; iter < 32; iter++) {
    for (const l of iter % 2 ? [...realLayers].reverse() : realLayers) {
      if (!l.length) continue;
      const want = l.map((it) => {
        const nb = neighbours.get(it) ?? [];
        return nb.length ? 0.5 * coord.get(it)! + 0.5 * mean(nb.map((x) => coord.get(x)!)) : coord.get(it)!;
      });
      const placed = [...want];
      for (let i = 1; i < l.length; i++) placed[i] = Math.max(placed[i], placed[i - 1] + 1);
      for (let i = l.length - 2; i >= 0; i--) placed[i] = Math.min(placed[i], placed[i + 1] - 1);
      // Pushing both ways can shift the layer; recentre on what it wanted.
      const drift = mean(want) - mean(placed);
      l.forEach((it, i) => coord.set(it, placed[i] + drift));
    }
  }
  // Bends route through the gaps between real nodes, near the straight line
  // between their edge's ends, in the order the sweeps chose.
  const realCoords = [...coord.values()];
  const lo0 = Math.min(...realCoords);
  const hi0 = Math.max(...realCoords);
  const margin = 0.3;
  for (const l of layers) {
    let i = 0;
    while (i < l.length) {
      if (!l[i].dummy) {
        i++;
        continue;
      }
      let j = i;
      while (j < l.length && l[j].dummy) j++;
      const lo = i > 0 ? coord.get(l[i - 1])! + margin : Math.min(lo0, (j < l.length ? coord.get(l[j])! : hi0) - 1) - 0.2;
      const hi = j < l.length ? coord.get(l[j])! - margin : Math.max(hi0, lo + 1) + 0.2;
      const run = l.slice(i, j);
      const want = run.map((d) => {
        const c = chains.find((ch) => ch.ids.includes(d.id))!;
        const a = items.get(c.ids[0])!;
        const b = items.get(c.ids[c.ids.length - 1])!;
        const t = (d.layer - a.layer) / (b.layer - a.layer);
        return Math.min(hi, Math.max(lo, coord.get(a)! + (coord.get(b)! - coord.get(a)!) * t));
      });
      const step = Math.min(0.12, (hi - lo) / Math.max(run.length, 1));
      for (let k = 1; k < run.length; k++) want[k] = Math.max(want[k], want[k - 1] + step);
      for (let k = run.length - 2; k >= 0; k--) want[k] = Math.min(want[k], want[k + 1] - step);
      run.forEach((d, k) => coord.set(d, Math.min(hi, Math.max(lo, want[k]))));
      i = j;
    }
  }

  // To pixels, scaled so the real nodes fill the box (bends may sit just outside).
  const lo = lo0;
  const hi = hi0;
  const span = Math.max(hi - lo, 1e-9);
  const main = opts.vertical ? opts.height : opts.width;
  const cross = opts.vertical ? opts.width : opts.height;
  const usableMain = Math.max(1, main - 2 * opts.pad);
  const usableCross = Math.max(1, cross - 2 * opts.pad);
  const toPx = (it: Item): Point => {
    const m = opts.pad + (nLayers > 1 ? (it.layer / (nLayers - 1)) * usableMain : usableMain / 2);
    const c = opts.pad + (hi > lo ? ((coord.get(it)! - lo) / span) * usableCross : usableCross / 2);
    return opts.vertical ? { x: c, y: m } : { x: m, y: c };
  };
  const nodes = new Map<string, LaidOutNode>();
  for (const l of layers) for (const it of l) if (!it.dummy) nodes.set(it.id, { id: it.id, layer: it.layer, order: it.pos, ...toPx(it) });
  const edges: LaidOutEdge[] = chains.map((c) => ({ from: c.from, to: c.to, points: c.ids.map((id) => toPx(items.get(id)!)) }));
  return { nodes, edges, layers: nLayers, crossings: bestC };
}

/**
 * A smooth path through layout points, sampled into a polyline with
 * cumulative lengths, so particles can move along it at constant speed.
 * Each leg is a cubic with tangents along the layer axis.
 */
export interface Polyline {
  xs: Float32Array;
  ys: Float32Array;
  /** Cumulative length at each sample. */
  len: Float32Array;
  total: number;
}

export function samplePath(points: Point[], vertical: boolean, perLeg = 24): Polyline {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const k = 0.5;
    const c1 = vertical ? { x: a.x, y: a.y + (b.y - a.y) * k } : { x: a.x + (b.x - a.x) * k, y: a.y };
    const c2 = vertical ? { x: b.x, y: b.y - (b.y - a.y) * k } : { x: b.x - (b.x - a.x) * k, y: b.y };
    for (let j = i === 0 ? 0 : 1; j <= perLeg; j++) {
      const t = j / perLeg;
      const u = 1 - t;
      xs.push(u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x);
      ys.push(u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y);
    }
  }
  const len = new Float32Array(xs.length);
  for (let i = 1; i < xs.length; i++) len[i] = len[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  return { xs: Float32Array.from(xs), ys: Float32Array.from(ys), len, total: len[len.length - 1] ?? 0 };
}

/** The point at distance d along a polyline. */
export function pointAt(p: Polyline, d: number, out: Point): Point {
  const { xs, ys, len } = p;
  if (d <= 0 || xs.length < 2) {
    out.x = xs[0] ?? 0;
    out.y = ys[0] ?? 0;
    return out;
  }
  if (d >= p.total) {
    out.x = xs[xs.length - 1];
    out.y = ys[ys.length - 1];
    return out;
  }
  let lo = 0;
  let hi = len.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (len[mid] <= d) lo = mid;
    else hi = mid;
  }
  const t = (d - len[lo]) / Math.max(len[hi] - len[lo], 1e-9);
  out.x = xs[lo] + (xs[hi] - xs[lo]) * t;
  out.y = ys[lo] + (ys[hi] - ys[lo]) * t;
  return out;
}
