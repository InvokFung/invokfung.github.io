// One technician's route: timing, cost, and the bookkeeping that makes an
// insertion check O(1).
//
// After every change the route is timed once forwards (arrival, start, end of
// each visit) and once backwards, which gives two latest-start times per visit:
//
//   LS[i]  the latest start at visit i that adds no lateness anywhere after it
//          and still gets the technician home before the overtime cap;
//   Z[i]   the latest start at visit i that leaves the return time unchanged.
//
// To test an insertion of job u between visits p-1 and p, time the two new
// legs and compare the new start at visit p with LS[p]: at or below it, no
// later visit becomes late, and that verdict is exact (the backward pass uses
// the inverse of the FIFO travel-time function, so rush hour is accounted for).
// Waiting at a later visit is what absorbs a push; LS and Z are Savelsbergh's
// forward time slack written as times instead of slacks. Only when the check
// fails, which means the insertion makes someone late, is the rest of the
// route re-timed to price that lateness.

import { canServe, type PJob, type Problem, type PVehicle } from "./model";

/** 1 when the job was planned on another technician before this solve. */
const movedTo = (j: PJob, v: PVehicle) => (j.home !== undefined && j.home >= 0 && j.home !== v.ref ? 1 : 0);

const EPS = 1e-7;
const W8 = 8;
const ARR = 0;
const ST = 1;
const DEP = 2;
const LSO = 3;
const ZO = 4;
const LEG = 5;
const SL = 6;
const SD = 7;

export class Route {
  readonly v: PVehicle;
  seq: number[];
  /**
   * Per-visit numbers, interleaved in one buffer (row i, stride 8) so a clone
   * is a single copy: arrival, start, departure, LS, Z, drive of the leg in,
   * and the suffix sums of weighted lateness and drive from visit i onwards.
   */
  b: Float64Array;
  ret = 0;
  retLeg = 0;
  lateW = 0;
  drive = 0;
  ot = 0;
  over = 0;
  load = 0;
  cost = 0;
  /** Lowest and highest congestion factor over the route's working hours, for the insertion bound. */
  cLo = 1;
  cHi = 1;

  constructor(v: PVehicle, seq: number[] = [], from?: Route) {
    this.v = v;
    this.seq = seq;
    this.b = from ? from.b.slice() : new Float64Array(Math.max(16, seq.length + 2) * W8);
  }

  arrAt(i: number): number {
    return this.b[i * W8 + ARR];
  }
  startAt(i: number): number {
    return this.b[i * W8 + ST];
  }
  depAt(i: number): number {
    return this.b[i * W8 + DEP];
  }
  lsAt(i: number): number {
    return this.b[i * W8 + LSO];
  }
  zAt(i: number): number {
    return this.b[i * W8 + ZO];
  }
  legInAt(i: number): number {
    return this.b[i * W8 + LEG];
  }

  get n(): number {
    return this.seq.length;
  }

  clone(): Route {
    const r = new Route(this.v, this.seq.slice(), this);
    r.ret = this.ret;
    r.retLeg = this.retLeg;
    r.lateW = this.lateW;
    r.drive = this.drive;
    r.ot = this.ot;
    r.over = this.over;
    r.load = this.load;
    r.cost = this.cost;
    r.cLo = this.cLo;
    r.cHi = this.cHi;
    return r;
  }

  private grow(rows: number) {
    if (this.b.length >= rows * W8) return;
    const next = new Float64Array(Math.max(rows, (this.b.length / W8) * 2) * W8);
    next.set(this.b);
    this.b = next;
  }

  /** Times the route forwards and backwards and prices it. O(n). */
  evaluate(P: Problem): void {
    const { ff, nLoc, traffic: tr, jobs, W } = P;
    const v = this.v;
    const n = this.seq.length;
    this.grow(n + 1);
    const B = this.b;
    let t = v.startTime;
    let loc = v.startLoc;
    let drive = 0;
    let lateW = 0;
    let load = 0;
    for (let i = 0; i < n; i++) {
      const j = jobs[this.seq[i]];
      const f = ff[loc * nLoc + j.loc];
      const a = tr.arrive(f, t);
      let s: number;
      let d: number;
      if (a < j.e) {
        // wait where you are, not at the customer's door: leave as late as still arrives at e
        s = j.e;
        d = j.e - Math.max(t, tr.latestDepart(f, j.e));
      } else {
        s = a;
        d = a - t;
      }
      B[i * W8 + ARR] = a;
      B[i * W8 + ST] = s;
      B[i * W8 + LEG] = d;
      drive += d;
      const late = s - j.l;
      if (late > 0) lateW += j.w * late;
      B[i * W8 + DEP] = s + j.dur;
      t = B[i * W8 + DEP];
      loc = j.loc;
      load += j.demand;
    }
    const fr = ff[loc * nLoc + v.endLoc];
    this.ret = tr.arrive(fr, t);
    this.retLeg = this.ret - t;
    drive += this.retLeg;

    // backward pass: latest starts and suffix sums
    let lsNext = v.hardEnd;
    let zNext = this.ret;
    let nextLoc = v.endLoc;
    let sl = 0;
    let sd = this.retLeg;
    B[n * W8 + SL] = 0;
    B[n * W8 + SD] = 0;
    for (let i = n - 1; i >= 0; i--) {
      const j = jobs[this.seq[i]];
      const f = ff[j.loc * nLoc + nextLoc];
      const s = B[i * W8 + ST];
      B[i * W8 + LSO] = Math.min(Math.max(j.l, s), tr.latestDepart(f, lsNext) - j.dur);
      B[i * W8 + ZO] = tr.latestDepart(f, zNext) - j.dur;
      lsNext = B[i * W8 + LSO];
      zNext = B[i * W8 + ZO];
      nextLoc = j.loc;
      const late = s - j.l;
      if (late > 0) sl += j.w * late;
      B[i * W8 + SL] = sl;
      B[i * W8 + SD] = sd; // legs out of i onwards
      sd += B[i * W8 + LEG];
    }

    this.drive = drive;
    this.lateW = lateW;
    this.load = load;
    this.ot = Math.max(0, this.ret - v.shiftEnd);
    this.over = Math.max(0, this.ret - v.hardEnd);
    const span = tr.range(v.startTime, Math.max(v.hardEnd, this.ret));
    this.cLo = span[0];
    this.cHi = span[1];
    let moves = 0;
    if (W.move) for (let i = 0; i < n; i++) moves += movedTo(jobs[this.seq[i]], v);
    this.cost = W.late * lateW + W.drive * drive + W.ot * this.ot + W.over * this.over + W.move * moves + (load > v.capacity ? W.over * 1000 * (load - v.capacity) : 0);
  }

  /**
   * Change in cost from inserting job `u` before position p (p = n: before
   * the trip home). Infinity when the technician lacks the skill, the van is
   * full, or the technician could not get home before the overtime cap.
   */
  insertCost(P: Problem, u: number, p: number): number {
    const { ff, nLoc, traffic: tr, jobs, W } = P;
    const B = this.b;
    const v = this.v;
    const J = jobs[u];
    const n = this.seq.length;
    const prevLoc = p === 0 ? v.startLoc : jobs[this.seq[p - 1]].loc;
    const prevDep = p === 0 ? v.startTime : B[(p - 1) * W8 + DEP];
    const f1 = ff[prevLoc * nLoc + J.loc];
    const a1 = tr.arrive(f1, prevDep);
    let su: number;
    let d1: number;
    if (a1 < J.e) {
      su = J.e;
      d1 = J.e - Math.max(prevDep, tr.latestDepart(f1, J.e));
    } else {
      su = a1;
      d1 = a1 - prevDep;
    }
    const lateU = su > J.l ? J.w * (su - J.l) : 0;
    const mv = W.move * movedTo(J, v);
    const du = su + J.dur;
    const nextLoc = p === n ? v.endLoc : jobs[this.seq[p]].loc;
    const f2 = ff[J.loc * nLoc + nextLoc];
    const a2 = tr.arrive(f2, du);

    if (p === n) {
      // new last visit: the trip home is the only thing after it
      if (a2 > v.hardEnd + EPS) return Infinity;
      const dDrive = d1 + (a2 - du) - this.retLeg;
      const dOt = Math.max(0, a2 - v.shiftEnd) - this.ot;
      return W.late * lateU + W.drive * dDrive + W.ot * dOt + mv;
    }

    const K = jobs[this.seq[p]];
    let sk: number;
    let d2: number;
    if (a2 < K.e) {
      sk = K.e;
      d2 = K.e - Math.max(du, tr.latestDepart(f2, K.e));
    } else {
      sk = a2;
      d2 = a2 - du;
    }
    if (sk <= B[p * W8 + LSO] + EPS) {
      // O(1): nobody after p becomes later than allowed, and the cap holds
      const push = sk - B[p * W8 + ZO];
      let dOt = 0;
      if (push > EPS) dOt = Math.max(0, this.ret + push - v.shiftEnd) - this.ot;
      const dDrive = d1 + d2 - B[p * W8 + LEG];
      return W.late * lateU + W.drive * dDrive + W.ot * dOt + mv;
    }

    // someone after p gets later: re-time the rest to price it exactly
    let t = sk;
    let lateW = sk > K.l ? K.w * (sk - K.l) : 0;
    let drive = 0;
    let loc = K.loc;
    t = sk + K.dur;
    for (let i = p + 1; i < n; i++) {
      const j = jobs[this.seq[i]];
      const f = ff[loc * nLoc + j.loc];
      const a = tr.arrive(f, t);
      let s: number;
      if (a < j.e) {
        s = j.e;
        drive += j.e - Math.max(t, tr.latestDepart(f, j.e));
      } else {
        s = a;
        drive += a - t;
      }
      if (s > j.l) lateW += j.w * (s - j.l);
      t = s + j.dur;
      loc = j.loc;
    }
    const ret = tr.arrive(ff[loc * nLoc + v.endLoc], t);
    if (ret > v.hardEnd + EPS && ret > this.ret + EPS) return Infinity;
    drive += ret - t;
    const dDrive = d1 + d2 + drive - B[p * W8 + LEG] - B[p * W8 + SD];
    const dLate = lateU + lateW - B[p * W8 + SL];
    const dOt = Math.max(0, ret - v.shiftEnd) - this.ot;
    const dOver = Math.max(0, ret - v.hardEnd) - this.over;
    return W.late * dLate + W.drive * dDrive + W.ot * dOt + W.over * dOver + mv;
  }

  /** Cheapest position for job u in this route, or pos -1. */
  bestInsertion(P: Problem, u: number, out: { cost: number; pos: number }): void {
    out.cost = Infinity;
    out.pos = -1;
    const J: PJob = P.jobs[u];
    if (!canServe(this.v, J) || this.load + J.demand > this.v.capacity) return;
    if (this.over > EPS) return; // already past the cap; fix it by removing, not by adding
    const { ff, nLoc, jobs } = P;
    const n = this.seq.length;
    const v = this.v;
    const wd = P.W.drive;
    const mv = P.W.move * movedTo(J, v);
    const lo = this.cLo;
    const hi = this.cHi;
    const uRow = J.loc * nLoc;
    // try first next to the closest visit, so the bound below has a good incumbent to beat
    let near = n;
    let nearD = ff[uRow + v.endLoc];
    for (let i = 0; i < n; i++) {
      const d = ff[uRow + jobs[this.seq[i]].loc];
      if (d < nearD) {
        nearD = d;
        near = i;
      }
    }
    const first = near;
    const second = near < n ? near + 1 : -1;
    for (let k = -2; k <= n; k++) {
      const p = k === -2 ? first : k === -1 ? second : k;
      if (p < 0 || (k >= 0 && (p === first || p === second))) continue;
      if (k >= 0 && out.cost < Infinity) {
        // lower bound: every other term is ≥ 0, and leg times sit between cLo and cHi times free flow
        const prevLoc = p === 0 ? v.startLoc : jobs[this.seq[p - 1]].loc;
        const nextLoc = p === n ? v.endLoc : jobs[this.seq[p]].loc;
        const lb = mv + wd * (lo * (ff[prevLoc * nLoc + J.loc] + ff[uRow + nextLoc]) - hi * ff[prevLoc * nLoc + nextLoc]);
        if (lb >= out.cost) continue;
      }
      const c = this.insertCost(P, u, p);
      if (c < out.cost) {
        out.cost = c;
        out.pos = p;
      }
    }
  }

  insert(P: Problem, u: number, p: number): void {
    this.seq.splice(p, 0, u);
    this.evaluate(P);
  }

  removeJobs(P: Problem, drop: Set<number>): void {
    this.seq = this.seq.filter((u) => !drop.has(u));
    this.evaluate(P);
  }
}
