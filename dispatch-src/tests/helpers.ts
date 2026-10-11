// Shared fixtures: a random routing problem with a known geometry, and a
// brute-force route simulator written independently of route.ts.

import type { PJob, Problem, PVehicle, Weights } from "../src/core/model";
import { WEIGHTS } from "../src/core/model";
import { Rng } from "../src/core/rng";
import { Traffic } from "../src/core/traffic";

export function randomProblem(seed: string, opts: { jobs?: number; vehicles?: number; traffic?: Traffic; W?: Weights; skills?: boolean } = {}): Problem {
  const rng = new Rng(seed);
  const nJobs = opts.jobs ?? 12;
  const nLoc = nJobs + 1;
  const xs = Array.from({ length: nLoc }, () => rng.uniform(0, 30));
  const ys = Array.from({ length: nLoc }, () => rng.uniform(0, 30));
  const ff = new Float64Array(nLoc * nLoc);
  for (let a = 0; a < nLoc; a++) for (let b = 0; b < nLoc; b++) ff[a * nLoc + b] = Math.hypot(xs[a] - xs[b], ys[a] - ys[b]);
  const jobs: PJob[] = [];
  for (let i = 1; i < nLoc; i++) {
    const e = 480 + rng.uniform(0, 420);
    const w = rng.pick([1, 2, 4]);
    jobs.push({ ref: i, loc: i, e, l: e + rng.uniform(20, 200), dur: rng.uniform(15, 70), mask: opts.skills ? 1 << rng.int(3) : 0, w, demand: 0, miss: 20000 + 10000 * w });
  }
  const vehicles: PVehicle[] = Array.from({ length: opts.vehicles ?? 1 }, (_, k) => {
    const start = 450 + rng.uniform(0, 60);
    return { ref: k, startLoc: 0, startTime: start, endLoc: 0, shiftEnd: start + 480, hardEnd: start + 540, skills: opts.skills ? 1 | (1 << (1 + (k % 2))) : 0, capacity: Infinity };
  });
  return { nLoc, ff, traffic: opts.traffic ?? Traffic.day([{ at: 700 + rng.uniform(0, 200), factor: 1.6 }]), jobs, vehicles, W: opts.W ?? WEIGHTS };
}

export interface Sim {
  late: number[];
  lateW: number;
  drive: number;
  ret: number;
  starts: number[];
  cost: number;
}

/** Times a route by walking it, with no slack bookkeeping. */
export function simulate(P: Problem, v: PVehicle, seq: readonly number[]): Sim {
  const tr = P.traffic;
  let t = v.startTime;
  let loc = v.startLoc;
  let drive = 0;
  let lateW = 0;
  const late: number[] = [];
  const starts: number[] = [];
  for (const u of seq) {
    const j = P.jobs[u];
    const f = P.ff[loc * P.nLoc + j.loc];
    const a = tr.arrive(f, t);
    let s = a;
    if (a < j.e) {
      // leaves as late as still arrives at e
      let lo = t;
      let hi = j.e;
      for (let k = 0; k < 200; k++) {
        const mid = (lo + hi) / 2;
        if (tr.arrive(f, mid) <= j.e) lo = mid;
        else hi = mid;
      }
      drive += j.e - lo;
      s = j.e;
    } else drive += a - t;
    const lt = Math.max(0, s - j.l);
    late.push(lt);
    lateW += j.w * lt;
    starts.push(s);
    t = s + j.dur;
    loc = j.loc;
  }
  const ret = tr.arrive(P.ff[loc * P.nLoc + v.endLoc], t);
  drive += ret - t;
  const ot = Math.max(0, ret - v.shiftEnd);
  const over = Math.max(0, ret - v.hardEnd);
  return { late, lateW, drive, ret, starts, cost: P.W.late * lateW + P.W.drive * drive + P.W.ot * ot + P.W.over * over };
}
