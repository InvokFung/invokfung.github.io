// What the day looks like at clock time t, derived from a snapshot: where each
// technician is and what state each job is in. Shared by the map, the
// timeline and the status strip.

import type { CityView, JobView, LegView, Snapshot, VisitView } from "../worker/protocol";

export type JobStatus = "hidden" | "planned" | "late" | "enroute" | "onsite" | "done" | "doneLate" | "unassigned";

export interface Scene {
  snap: Snapshot;
  legs: LegView[][];
  visits: VisitView[][];
  visitOf: Map<number, VisitView>;
  legTo: Map<number, LegView>;
  pool: Set<number>;
  skipped: Set<number>;
  jobs: JobView[];
}

const cache = new WeakMap<Snapshot, Scene>();

export function scene(snap: Snapshot): Scene {
  const hit = cache.get(snap);
  if (hit) return hit;
  const legs: LegView[][] = snap.techs.map(() => []);
  const visits: VisitView[][] = snap.techs.map(() => []);
  const visitOf = new Map<number, VisitView>();
  const legTo = new Map<number, LegView>();
  for (const l of snap.legs) {
    legs[l.tech].push(l);
    if (l.job >= 0 && l.cut === undefined) legTo.set(l.job, l);
  }
  for (const v of snap.visits) {
    visits[v.tech].push(v);
    if (!v.abandoned) visitOf.set(v.job, v);
  }
  for (const ls of legs) ls.sort((a, b) => a.depart - b.depart);
  for (const vs of visits) vs.sort((a, b) => a.start - b.start);
  const s: Scene = { snap, legs, visits, visitOf, legTo, pool: new Set(snap.pool), skipped: new Set(snap.skipped), jobs: snap.jobs };
  cache.set(snap, s);
  return s;
}

export function jobStatus(sc: Scene, id: number, t: number): JobStatus {
  const j = sc.jobs[id];
  if (j.release > t + 1e-6) return "hidden";
  const v = sc.visitOf.get(id);
  if (!v || sc.skipped.has(id)) return "unassigned";
  if (v.end <= t) return v.late > 1e-6 ? "doneLate" : "done";
  if (v.start <= t) return "onsite";
  const leg = sc.legTo.get(id);
  if (leg && leg.depart <= t) return "enroute";
  return v.late > 1e-6 ? "late" : "planned";
}

export interface TechAt {
  x: number;
  y: number;
  state: "depot" | "driving" | "onsite" | "idle" | "gone" | "off";
  job: number;
}

/** Position along a leg's street path, by share of its length. */
function along(city: CityView, path: number[], frac: number): [number, number] {
  if (path.length === 1) return [city.xs[path[0]], city.ys[path[0]]];
  let total = 0;
  const seg: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(city.xs[path[i]] - city.xs[path[i - 1]], city.ys[path[i]] - city.ys[path[i - 1]]);
    seg.push(d);
    total += d;
  }
  let want = Math.max(0, Math.min(1, frac)) * total;
  for (let i = 1; i < path.length; i++) {
    if (want <= seg[i - 1] || i === path.length - 1) {
      const f = seg[i - 1] ? Math.min(1, want / seg[i - 1]) : 1;
      const a = path[i - 1];
      const b = path[i];
      return [city.xs[a] + (city.xs[b] - city.xs[a]) * f, city.ys[a] + (city.ys[b] - city.ys[a]) * f];
    }
    want -= seg[i - 1];
  }
  const last = path[path.length - 1];
  return [city.xs[last], city.ys[last]];
}

export function techAt(sc: Scene, city: CityView, k: number, t: number): TechAt {
  const tech = sc.snap.techs[k];
  const home = { x: city.xs[tech.depot], y: city.ys[tech.depot] };
  if (tech.gone !== null && t >= tech.gone) return { ...home, state: "gone", job: -1 };
  for (const l of sc.legs[k]) {
    const stop = l.cut ?? l.arrive;
    if (l.depart <= t && t < stop) {
      const frac = l.arrive > l.depart ? (t - l.depart) / (l.arrive - l.depart) : 1;
      const [x, y] = along(city, l.path, frac);
      return { x, y, state: "driving", job: l.job };
    }
  }
  for (const v of sc.visits[k]) {
    if (v.arrive <= t && t < v.end && !(v.abandoned && v.start === v.end)) {
      const j = sc.jobs[v.job];
      return { x: city.xs[j.node], y: city.ys[j.node], state: "onsite", job: v.job };
    }
  }
  // otherwise: where the last finished leg ended
  let node = tech.depot;
  for (const l of sc.legs[k]) if ((l.cut ?? l.arrive) <= t && l.cut === undefined) node = l.path[l.path.length - 1];
  const before = t < tech.start;
  return { x: city.xs[node], y: city.ys[node], state: node === tech.depot ? (before ? "off" : "depot") : "idle", job: -1 };
}
