// Personalized PageRank by power iteration on a small weighted digraph.
// With probability `damping` the walker follows an out-edge (chosen in
// proportion to its weight); otherwise it restarts at a node drawn from the
// personalization vector. A node without out-edges restarts too.

export interface WeightedEdge {
  from: number;
  to: number;
  w: number;
}

export interface PageRankOptions {
  damping?: number;
  tol?: number;
  maxIter?: number;
}

export function pageRank(n: number, edges: readonly WeightedEdge[], personalization?: ArrayLike<number>, opts: PageRankOptions = {}): { rank: Float64Array; iterations: number } {
  const d = opts.damping ?? 0.85;
  const tol = opts.tol ?? 1e-10;
  const maxIter = opts.maxIter ?? 500;
  const p = new Float64Array(n);
  let ps = 0;
  for (let i = 0; i < n; i++) ps += p[i] = Math.max(0, personalization ? personalization[i] : 1);
  if (ps <= 0) p.fill(1 / n);
  else for (let i = 0; i < n; i++) p[i] /= ps;

  const outW = new Float64Array(n);
  for (const e of edges) if (e.w > 0) outW[e.from] += e.w;

  let r = Float64Array.from(p);
  let next = new Float64Array(n);
  let it = 0;
  for (; it < maxIter; it++) {
    next.fill(0);
    let dangling = 0;
    for (let i = 0; i < n; i++) if (outW[i] <= 0) dangling += r[i];
    for (const e of edges) if (e.w > 0) next[e.to] += (d * r[e.from] * e.w) / outW[e.from];
    const restart = 1 - d + d * dangling;
    let delta = 0;
    for (let i = 0; i < n; i++) {
      next[i] += restart * p[i];
      delta += Math.abs(next[i] - r[i]);
    }
    [r, next] = [next, r];
    if (delta < tol) {
      it++;
      break;
    }
  }
  return { rank: r, iterations: it };
}
