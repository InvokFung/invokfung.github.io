// Construction by regret-k insertion, then adaptive large neighbourhood search
// (Ropke & Pisinger 2006): each iteration tears out part of the plan with one
// of four destroy operators and puts it back with one of three repair
// operators; simulated annealing decides whether to keep the result, and
// operators that keep finding improvements are picked more often.

import { Q_FRAC, Q_MAX } from "./config";
import type { Problem } from "./model";
import { Rng } from "./rng";
import { Route } from "./route";

export interface Solution {
  routes: Route[];
  unassigned: number[];
  cost: number;
  /** Routes still shared with another solution: clone before changing (copy on write). */
  shared?: Uint8Array;
}

/** A copy that shares every route until one is changed. */
export function shallow(s: Solution): Solution {
  return { routes: s.routes.slice(), unassigned: s.unassigned.slice(), cost: s.cost, shared: new Uint8Array(s.routes.length).fill(1) };
}

/** Route r of s, safe to change. */
export function mut(s: Solution, r: number): Route {
  if (s.shared && s.shared[r]) {
    s.routes[r] = s.routes[r].clone();
    s.shared[r] = 0;
  }
  return s.routes[r];
}

export function totalCost(P: Problem, routes: Route[], unassigned: number[]): number {
  let c = 0;
  for (const r of routes) c += r.cost;
  for (const u of unassigned) c += P.jobs[u].miss;
  return c;
}

export function cloneSolution(s: Solution): Solution {
  return { routes: s.routes.map((r) => r.clone()), unassigned: s.unassigned.slice(), cost: s.cost };
}

/** Builds a solution from sequences of job indices (one per vehicle); jobs not in any sequence are unassigned. */
export function fromSequences(P: Problem, seqs: number[][]): Solution {
  const routes = P.vehicles.map((v, k) => {
    const r = new Route(v, (seqs[k] ?? []).slice());
    r.evaluate(P);
    return r;
  });
  const seen = new Set(seqs.flat());
  const unassigned: number[] = [];
  for (let u = 0; u < P.jobs.length; u++) if (!seen.has(u)) unassigned.push(u);
  return { routes, unassigned, cost: totalCost(P, routes, unassigned) };
}

/** Takes jobs off the end of any route that cannot get home before the overtime cap. */
export function enforceCap(P: Problem, s: Solution): void {
  for (let k = 0; k < s.routes.length; k++) {
    if (!(s.routes[k].over > 1e-7)) continue;
    const r = mut(s, k);
    while (r.over > 1e-7 && r.seq.length > 0) {
      // drop the visit whose removal helps most, preferring low priority
      let best = r.seq.length - 1;
      let bestW = Infinity;
      for (let i = 0; i < r.seq.length; i++) {
        const w = P.jobs[r.seq[i]].w;
        if (w < bestW) {
          bestW = w;
          best = i;
        }
      }
      // among the lowest priority, the last one
      for (let i = r.seq.length - 1; i >= 0; i--) {
        if (P.jobs[r.seq[i]].w === bestW) {
          best = i;
          break;
        }
      }
      s.unassigned.push(r.seq[best]);
      r.seq.splice(best, 1);
      r.evaluate(P);
    }
  }
  s.cost = totalCost(P, s.routes, s.unassigned);
}

const tmp = { cost: 0, pos: -1 };

/**
 * Regret-k insertion of the unassigned jobs. k = 1 is plain greedy (always the
 * cheapest insertion overall); k ≥ 2 inserts first the job that would lose
 * most by waiting, the sum of the gaps between its best route and its next
 * k-1. A job with no feasible route stays unassigned.
 */
export function regretInsert(P: Problem, s: Solution, k: number): void {
  const pool = s.unassigned;
  if (pool.length === 0) return;
  const V = s.routes.length;
  const m = pool.length;
  const cost = new Float64Array(m * V);
  const pos = new Int32Array(m * V);
  const alive = new Uint8Array(m).fill(1);
  for (let i = 0; i < m; i++) {
    for (let r = 0; r < V; r++) {
      s.routes[r].bestInsertion(P, pool[i], tmp);
      cost[i * V + r] = tmp.cost;
      pos[i * V + r] = tmp.pos;
    }
  }
  const left: number[] = [];
  const best = new Float64Array(Math.max(k, 1));
  for (let step = 0; step < m; step++) {
    let pick = -1;
    let pickRoute = -1;
    let pickScore = -Infinity;
    let pickCost = Infinity;
    for (let i = 0; i < m; i++) {
      if (!alive[i]) continue;
      // the k cheapest routes for this job
      best.fill(Infinity);
      let bestRoute = -1;
      for (let r = 0; r < V; r++) {
        const c = cost[i * V + r];
        if (c < best[best.length - 1]) {
          let q = best.length - 1;
          while (q > 0 && best[q - 1] > c) {
            best[q] = best[q - 1];
            q--;
          }
          best[q] = c;
          if (q === 0) bestRoute = r;
        }
      }
      if (bestRoute < 0) continue;
      const miss = P.jobs[pool[i]].miss;
      let score: number;
      if (k <= 1) score = -best[0];
      else {
        score = 0;
        for (let q = 1; q < k; q++) score += Math.min(best[q], miss) - best[0];
      }
      if (score > pickScore + 1e-9 || (Math.abs(score - pickScore) <= 1e-9 && best[0] < pickCost)) {
        pick = i;
        pickRoute = bestRoute;
        pickScore = score;
        pickCost = best[0];
      }
    }
    if (pick < 0) break;
    alive[pick] = 0;
    const route = mut(s, pickRoute);
    route.insert(P, pool[pick], pos[pick * V + pickRoute]);
    for (let i = 0; i < m; i++) {
      if (!alive[i]) continue;
      route.bestInsertion(P, pool[i], tmp);
      cost[i * V + pickRoute] = tmp.cost;
      pos[i * V + pickRoute] = tmp.pos;
    }
  }
  for (let i = 0; i < m; i++) if (alive[i]) left.push(pool[i]);
  s.unassigned = left;
  s.cost = totalCost(P, s.routes, s.unassigned);
}

// ---------------------------------------------------------------- destroy operators

type Destroy = (P: Problem, s: Solution, q: number, rng: Rng) => void;

function assigned(s: Solution): { u: number; r: number; i: number }[] {
  const out: { u: number; r: number; i: number }[] = [];
  s.routes.forEach((route, r) => route.seq.forEach((u, i) => out.push({ u, r, i })));
  return out;
}

function removeSet(P: Problem, s: Solution, drop: Set<number>): void {
  for (let k = 0; k < s.routes.length; k++) if (s.routes[k].seq.some((u) => drop.has(u))) mut(s, k).removeJobs(P, drop);
  for (const u of drop) s.unassigned.push(u);
}

const randomRemoval: Destroy = (P, s, q, rng) => {
  const all = assigned(s);
  rng.shuffle(all);
  removeSet(P, s, new Set(all.slice(0, q).map((x) => x.u)));
};

/** Removes the visits that cost most where they are (detour plus own lateness), with some randomness. */
const worstRemoval: Destroy = (P, s, q, rng) => {
  const { ff, nLoc, traffic: tr, jobs, W } = P;
  const scored = assigned(s).map(({ u, r, i }) => {
    const route = s.routes[r];
    const v = route.v;
    const prevLoc = i === 0 ? v.startLoc : jobs[route.seq[i - 1]].loc;
    const prevDep = i === 0 ? v.startTime : route.depAt(i - 1);
    const nextLoc = i === route.seq.length - 1 ? v.endLoc : jobs[route.seq[i + 1]].loc;
    const legOut = i === route.seq.length - 1 ? route.retLeg : route.legInAt(i + 1);
    const direct = tr.arrive(ff[prevLoc * nLoc + nextLoc], prevDep) - prevDep;
    const j = jobs[u];
    const late = Math.max(0, route.startAt(i) - j.l) * j.w;
    return { u, gain: W.drive * (route.legInAt(i) + legOut - direct) + W.late * late };
  });
  scored.sort((a, b) => b.gain - a.gain || a.u - b.u);
  const drop = new Set<number>();
  while (drop.size < q && scored.length) {
    const idx = Math.floor(Math.pow(rng.next(), 4) * scored.length);
    drop.add(scored[idx].u);
    scored.splice(idx, 1);
  }
  removeSet(P, s, drop);
};

const relCache = new WeakMap<Problem, Float64Array>();

/** Relatedness between every pair of jobs (lower is more alike), computed once per problem. */
function relatedness(P: Problem): Float64Array {
  let m = relCache.get(P);
  if (m) return m;
  const { ff, nLoc, jobs } = P;
  const J = jobs.length;
  m = new Float64Array(J * J);
  for (let a = 0; a < J; a++) {
    const A = jobs[a];
    for (let b = 0; b < J; b++) {
      const B = jobs[b];
      m[a * J + b] = ff[A.loc * nLoc + B.loc] / 30 + Math.abs(A.e - B.e) / 240 + Math.abs(A.l - B.l) / 480 + (A.mask !== B.mask ? 0.5 : 0);
    }
  }
  relCache.set(P, m);
  return m;
}

/** Reorders idx so idx[k] holds the k-th smallest key (quickselect, middle pivot, deterministic). */
function select(idx: number[], key: (x: number) => number, k: number): number {
  let lo = 0;
  let hi = idx.length - 1;
  while (lo < hi) {
    const pivot = key(idx[(lo + hi) >> 1]);
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (key(idx[i]) < pivot) i++;
      while (key(idx[j]) > pivot) j--;
      if (i <= j) {
        const t = idx[i];
        idx[i] = idx[j];
        idx[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
  return idx[k];
}

/** Shaw removal: a seed visit and the visits most like it (near, similar window, same skill). */
const relatedRemoval: Destroy = (P, s, q, rng) => {
  const all = assigned(s);
  if (!all.length) return;
  const rel = relatedness(P);
  const J = P.jobs.length;
  const seed = rng.pick(all).u;
  const drop = new Set<number>([seed]);
  const rest = all.map((x) => x.u).filter((u) => u !== seed);
  const picked = [seed];
  while (drop.size < q && rest.length) {
    const ref = picked[rng.int(picked.length)] * J;
    const idx = Math.floor(Math.pow(rng.next(), 5) * rest.length);
    const u = select(rest, (x) => rel[ref + x] * 1e6 + x * 1e-6, idx);
    drop.add(u);
    picked.push(u);
    rest.splice(rest.indexOf(u), 1);
  }
  removeSet(P, s, drop);
};

/** Empties one route (two if it is short), so its work can be shared out differently. */
const routeRemoval: Destroy = (P, s, q, rng) => {
  const used = s.routes.map((r, k) => ({ r, k })).filter((x) => x.r.seq.length > 0);
  if (!used.length) return;
  const drop = new Set<number>();
  rng.shuffle(used);
  for (const { r } of used) {
    for (const u of r.seq) drop.add(u);
    if (drop.size >= Math.max(3, q / 2)) break;
  }
  removeSet(P, s, drop);
};

export const DESTROY: { name: string; fn: Destroy }[] = [
  { name: "random", fn: randomRemoval },
  { name: "worst", fn: worstRemoval },
  { name: "related", fn: relatedRemoval },
  { name: "route", fn: routeRemoval },
];

export const REPAIR: { name: string; k: number }[] = [
  { name: "greedy", k: 1 },
  { name: "regret-2", k: 2 },
  { name: "regret-3", k: 3 },
];

// ---------------------------------------------------------------- ALNS

export interface AlnsOptions {
  iterations: number;
  /** Stop early at this many milliseconds, whatever the iteration count. */
  deadlineMs?: number;
  seed: string;
  /** Iterations per weight update. */
  segment?: number;
  reaction?: number;
  /** Largest removal: min(qMax, qFrac × jobs). */
  qMax?: number;
  qFrac?: number;
  now?: () => number;
}

export interface AlnsStats {
  iterations: number;
  ms: number;
  hitDeadline: boolean;
  startCost: number;
  bestCost: number;
  improvements: number;
  destroyUse: Record<string, number>;
  repairUse: Record<string, number>;
  destroyWeights: Record<string, number>;
  repairWeights: Record<string, number>;
}

const SIGMA_BEST = 33;
const SIGMA_BETTER = 9;
const SIGMA_ACCEPTED = 13;

/** Soft part of the cost (drive and overtime), which sets the annealing temperature. */
function softCost(s: Solution): number {
  let c = 0;
  for (const r of s.routes) c += r.drive + r.ot;
  return Math.max(c, 1);
}

export function alns(P: Problem, start: Solution, opts: AlnsOptions): { best: Solution; stats: AlnsStats } {
  const now = opts.now ?? (() => performance.now());
  const t0 = now();
  const rng = new Rng(`alns:${opts.seed}`);
  const segment = opts.segment ?? 50;
  const reaction = opts.reaction ?? 0.15;
  const nJobs = P.jobs.length;
  let cur = shallow(start);
  let best = cur;
  const stats: AlnsStats = {
    iterations: 0,
    ms: 0,
    hitDeadline: false,
    startCost: start.cost,
    bestCost: start.cost,
    improvements: 0,
    destroyUse: Object.fromEntries(DESTROY.map((d) => [d.name, 0])),
    repairUse: Object.fromEntries(REPAIR.map((r) => [r.name, 0])),
    destroyWeights: {},
    repairWeights: {},
  };
  if (nJobs < 2 || opts.iterations <= 0) {
    stats.ms = now() - t0;
    stats.destroyWeights = Object.fromEntries(DESTROY.map((d) => [d.name, 1]));
    stats.repairWeights = Object.fromEntries(REPAIR.map((r) => [r.name, 1]));
    return { best, stats };
  }
  const dW = DESTROY.map(() => 1);
  const rW = REPAIR.map(() => 1);
  const dScore = DESTROY.map(() => 0);
  const rScore = REPAIR.map(() => 0);
  const dCount = DESTROY.map(() => 0);
  const rCount = REPAIR.map(() => 0);
  // accept a solution 3% worse (on drive and overtime) with probability 1/2 at the start, cooling to 1/200 of that
  const T0 = (0.03 * softCost(start)) / Math.LN2;
  const Tend = T0 / 200;
  const qMin = Math.min(nJobs, Math.max(2, Math.min(4, Math.floor(nJobs / 3))));
  const qMax = Math.min(nJobs, Math.max(qMin, Math.min(opts.qMax ?? Q_MAX, Math.ceil(nJobs * (opts.qFrac ?? Q_FRAC)))));

  for (let it = 0; it < opts.iterations; it++) {
    if (opts.deadlineMs !== undefined) {
      // stop when the next iteration, at the average pace so far, would end past the deadline
      const el = now() - t0;
      if (el > opts.deadlineMs || (it > 0 && el + el / it > opts.deadlineMs)) {
        stats.hitDeadline = true;
        break;
      }
    }
    const T = T0 * Math.pow(Tend / T0, it / opts.iterations);
    const d = rng.weighted(dW);
    const r = rng.weighted(rW);
    const q = rng.range(qMin, qMax);
    const cand = shallow(cur);
    DESTROY[d].fn(P, cand, q, rng);
    regretInsert(P, cand, REPAIR[r].k);
    stats.destroyUse[DESTROY[d].name]++;
    stats.repairUse[REPAIR[r].name]++;
    dCount[d]++;
    rCount[r]++;
    let score = 0;
    if (cand.cost < best.cost - 1e-6) {
      best = cand;
      cur = cand;
      score = SIGMA_BEST;
      stats.improvements++;
    } else if (cand.cost < cur.cost - 1e-6) {
      cur = cand;
      score = SIGMA_BETTER;
    } else if (cand.cost > cur.cost + 1e-6 && rng.next() < Math.exp(-(cand.cost - cur.cost) / T)) {
      cur = cand;
      score = SIGMA_ACCEPTED;
    }
    dScore[d] += score;
    rScore[r] += score;
    stats.iterations = it + 1;
    if ((it + 1) % segment === 0) {
      for (let i = 0; i < dW.length; i++) {
        if (dCount[i]) dW[i] = Math.max(0.05, dW[i] * (1 - reaction) + (reaction * dScore[i]) / dCount[i]);
        dScore[i] = 0;
        dCount[i] = 0;
      }
      for (let i = 0; i < rW.length; i++) {
        if (rCount[i]) rW[i] = Math.max(0.05, rW[i] * (1 - reaction) + (reaction * rScore[i]) / rCount[i]);
        rScore[i] = 0;
        rCount[i] = 0;
      }
    }
  }
  stats.ms = now() - t0;
  stats.bestCost = best.cost;
  stats.destroyWeights = Object.fromEntries(DESTROY.map((x, i) => [x.name, Math.round(dW[i] * 100) / 100]));
  stats.repairWeights = Object.fromEntries(REPAIR.map((x, i) => [x.name, Math.round(rW[i] * 100) / 100]));
  return { best, stats };
}

/** Regret-3 from an empty plan (or from the given sequences), then ALNS. */
export function solve(P: Problem, opts: AlnsOptions & { seqs?: number[][] }): { best: Solution; construct: Solution; stats: AlnsStats } {
  const s = fromSequences(P, opts.seqs ?? []);
  enforceCap(P, s);
  regretInsert(P, s, 3);
  const construct = cloneSolution(s);
  const { best, stats } = alns(P, s, opts);
  return { best, construct, stats };
}
