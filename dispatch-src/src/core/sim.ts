// The day as it happens. A Sim holds what has been done (frozen), what each
// technician is doing now, and the plan for the rest. Events arrive in time
// order: a technician goes home, an urgent job comes in, a job overruns, the
// traffic changes. On each one the Sim first moves the clock to the event,
// freezing every visit a technician has already set off for, then applies the
// event and hands the rest of the day to a policy: Dispatch re-optimises it,
// the "keep the morning plan" baseline only patches it.
//
// Technicians leave as late as still arrives at the start of a window, so
// they wait where they are instead of at a customer's door. A visit is frozen
// once its technician has set off for it; anything not yet set off for can
// still move.

import type { City } from "./city";
import { DAY_START, PRIO_WEIGHT, type Day, type Job, type Skill } from "./day";
import { outcome, type Outcome } from "./metrics";
import { missCost, WEIGHTS, type PJob, type Problem, type PVehicle } from "./model";
import { alns, enforceCap, fromSequences, regretInsert, type AlnsStats } from "./solver";
import { Traffic, type TrafficEvent } from "./traffic";

const EPS = 1e-6;

export type DayEvent =
  | { kind: "sick"; at: number; tech: number }
  | { kind: "urgent"; at: number; node: number; skill: Skill; dur: number; task: string; window?: number }
  | { kind: "overrun"; at?: number; job: number; extra: number }
  | { kind: "traffic"; at: number; factor: number };

export interface Leg {
  tech: number;
  from: number;
  to: number;
  depart: number;
  arrive: number;
  /** Job at the end of the leg, or -1 for the trip home. */
  job: number;
  /** The technician went home part-way, at this time. */
  cut?: number;
}

export interface Visit {
  job: number;
  tech: number;
  arrive: number;
  start: number;
  end: number;
  /** Abandoned when the technician went home mid-visit or on the way to it. */
  abandoned?: boolean;
}

interface TechState {
  node: number;
  /** When the technician is next free at `node`. */
  time: number;
  visits: Visit[];
  legs: Leg[];
  plan: number[];
  gone: number | null;
}

export interface Moved {
  job: number;
  /** Technician before the re-plan; -1 unassigned, -2 a new job. */
  from: number;
  /** Technician after; -1 unassigned. */
  to: number;
}

export interface ReactInfo {
  ms: number;
  iterations: number;
  hitDeadline: boolean;
  moved: Moved[];
  jobsInPlay: number;
  techsInPlay: number;
}

export interface Policy {
  name: string;
  react(sim: Sim, ev: DayEvent): Omit<ReactInfo, "moved">;
}

export interface Projection {
  visits: Visit[];
  legs: Leg[];
  skipped: number[];
  ret: number;
}

export interface LogEntry {
  at: number;
  event: DayEvent;
  info: ReactInfo;
}

export class Sim {
  readonly city: City;
  readonly day: Day;
  readonly jobs: Job[];
  /** Durations as currently known (an overrun lengthens one when it is reported). */
  readonly dur: number[];
  readonly techs: TechState[];
  readonly pool = new Set<number>();
  readonly trafficEvents: TrafficEvent[] = [];
  traffic: Traffic;
  now = DAY_START;
  readonly policy: Policy;
  readonly log: LogEntry[] = [];
  private pending: { job: number; extra: number }[] = [];
  /** Jobs the current event put back in the pool (for the keep-the-plan baseline). */
  affected: number[] = [];
  private urgentCount = 0;

  constructor(city: City, day: Day, plans: number[][], unassigned: number[], policy: Policy) {
    this.city = city;
    this.day = day;
    this.jobs = day.jobs.map((j) => ({ ...j }));
    this.dur = this.jobs.map((j) => j.dur);
    this.traffic = Traffic.day();
    this.policy = policy;
    this.techs = day.techs.map((t, k) => ({ node: t.depot, time: t.start, visits: [], legs: [], plan: (plans[k] ?? []).slice(), gone: null }));
    for (const u of unassigned) this.pool.add(u);
  }

  ff(a: number, b: number): number {
    return this.city.ap.dist[a * this.city.ap.n + b];
  }

  hardEnd(k: number): number {
    return this.day.techs[k].end + this.day.otCap;
  }

  /** The rest of technician k's day if nothing else happens. */
  project(k: number): Projection {
    const T = this.techs[k];
    const tech = this.day.techs[k];
    const tr = this.traffic;
    const visits: Visit[] = [];
    const legs: Leg[] = [];
    const skipped: number[] = [];
    if (T.gone !== null) return { visits, legs, skipped: T.plan.slice(), ret: T.gone };
    let loc = T.node;
    let t = T.time;
    const hard = this.hardEnd(k);
    for (const u of T.plan) {
      const j = this.jobs[u];
      const f = this.ff(loc, j.node);
      const a = tr.arrive(f, t);
      let depart = t;
      let arrive = a;
      if (a < j.e) {
        depart = Math.max(t, tr.latestDepart(f, j.e));
        arrive = j.e;
      }
      const start = Math.max(arrive, j.e);
      const end = start + this.dur[u];
      const back = tr.arrive(this.ff(j.node, tech.depot), end);
      if (back > hard + EPS) {
        skipped.push(u);
        continue;
      }
      legs.push({ tech: k, from: loc, to: j.node, depart, arrive, job: u });
      visits.push({ job: u, tech: k, arrive, start, end });
      loc = j.node;
      t = end;
    }
    let ret = t;
    if (loc !== tech.depot) {
      ret = tr.arrive(this.ff(loc, tech.depot), t);
      legs.push({ tech: k, from: loc, to: tech.depot, depart: t, arrive: ret, job: -1 });
    }
    return { visits, legs, skipped, ret };
  }

  /** Freezes everything a technician has set off for by time t (and trips home already begun). */
  private commitUntil(t: number): void {
    for (let k = 0; k < this.techs.length; k++) {
      const T = this.techs[k];
      if (T.gone !== null) continue;
      const p = this.project(k);
      let vi = 0;
      for (const leg of p.legs) {
        if (leg.depart > t + EPS) break;
        if (leg.job >= 0) {
          const v = p.visits[vi++];
          T.legs.push(leg);
          T.visits.push(v);
          T.plan.splice(T.plan.indexOf(v.job), 1);
          T.node = leg.to;
          T.time = v.end;
        } else {
          T.legs.push(leg);
          T.node = leg.to;
          T.time = leg.arrive;
        }
      }
    }
    this.now = Math.max(this.now, t);
  }

  /** Where the scripted overruns would be reported under the current plan. */
  private nextPending(): { at: number; idx: number } | null {
    let best: { at: number; idx: number } | null = null;
    this.pending.forEach((o, idx) => {
      let start: number | null = null;
      for (let k = 0; k < this.techs.length && start === null; k++) {
        const T = this.techs[k];
        const done = T.visits.find((v) => v.job === o.job && !v.abandoned);
        if (done) start = done.start;
        else if (T.gone === null && T.plan.includes(o.job)) {
          const v = this.project(k).visits.find((x) => x.job === o.job);
          if (v) start = v.start;
        }
      }
      if (start === null) return;
      const at = Math.max(this.now, start + this.jobs[o.job].dur / 2);
      if (!best || at < best.at) best = { at, idx };
    });
    return best;
  }

  /** Moves the clock to t, reporting any scripted overrun that falls before it. */
  advance(t: number): void {
    for (;;) {
      const nx = this.nextPending();
      if (nx && nx.at <= t) {
        const o = this.pending.splice(nx.idx, 1)[0];
        this.commitUntil(nx.at);
        this.react({ kind: "overrun", at: nx.at, job: o.job, extra: o.extra });
        continue;
      }
      this.commitUntil(t);
      return;
    }
  }

  /** The time of the next scripted overrun report, if one is due under the current plan. */
  nextAuto(): number | null {
    return this.nextPending()?.at ?? null;
  }

  apply(ev: DayEvent): LogEntry | null {
    if (ev.kind === "overrun" && ev.at === undefined) {
      this.pending.push({ job: ev.job, extra: ev.extra });
      return null;
    }
    this.advance(ev.at!);
    return this.react(ev);
  }

  private assignment(): Map<number, number> {
    const m = new Map<number, number>();
    this.techs.forEach((T, k) => T.plan.forEach((u) => m.set(u, k)));
    for (const u of this.pool) m.set(u, -1);
    return m;
  }

  private react(ev: DayEvent): LogEntry {
    const at = ev.at!;
    const before = this.assignment();
    this.affected = [];
    switch (ev.kind) {
      case "sick": {
        const T = this.techs[ev.tech];
        if (T.gone !== null) break;
        const last = T.visits[T.visits.length - 1];
        if (last && !last.abandoned && last.end > at + EPS) {
          last.abandoned = true;
          if (last.start > at) last.arrive = last.start = last.end = at; // still on the way
          else last.end = at; // mid-visit: the customer needs another visit
          this.pool.add(last.job);
          this.affected.push(last.job);
          before.set(last.job, ev.tech);
        }
        const leg = T.legs[T.legs.length - 1];
        if (leg && leg.arrive > at + EPS) leg.cut = at;
        for (const u of T.plan) {
          this.pool.add(u);
          this.affected.push(u);
        }
        T.plan = [];
        T.gone = at;
        break;
      }
      case "urgent": {
        const id = this.jobs.length;
        this.urgentCount++;
        const win = ev.window ?? 120;
        this.jobs.push({ id, label: `U-${this.urgentCount}`, task: ev.task, node: ev.node, e: at, l: at + win, dur: ev.dur, skill: ev.skill, prio: 3, kind: "urgent", release: at });
        this.dur.push(ev.dur);
        this.pool.add(id);
        this.affected.push(id);
        before.set(id, -2);
        break;
      }
      case "overrun": {
        const u = ev.job;
        let doneAlready = false;
        for (const T of this.techs) {
          const v = T.visits.find((x) => x.job === u && !x.abandoned);
          if (!v) continue;
          if (v.end <= at + EPS) doneAlready = true;
          else {
            v.end += ev.extra;
            if (T.visits[T.visits.length - 1] === v) T.time = v.end;
          }
        }
        if (!doneAlready) this.dur[u] += ev.extra;
        break;
      }
      case "traffic": {
        this.trafficEvents.push({ at, factor: ev.factor });
        this.traffic = Traffic.day(this.trafficEvents);
        // legs under way at the change slow down (or speed up) from here on
        for (const T of this.techs) {
          if (T.gone !== null) continue;
          const leg = T.legs[T.legs.length - 1];
          if (!leg || leg.arrive <= at + EPS || leg.depart > at) continue;
          leg.arrive = this.traffic.arrive(this.ff(leg.from, leg.to), leg.depart);
          if (leg.job >= 0) {
            const v = T.visits[T.visits.length - 1];
            const j = this.jobs[v.job];
            v.arrive = leg.arrive;
            v.start = Math.max(leg.arrive, j.e);
            v.end = v.start + this.dur[v.job];
            T.time = v.end;
          } else T.time = leg.arrive;
        }
        break;
      }
    }
    // technicians who are idle cannot leave before the decision is made
    this.techs.forEach((T, k) => {
      if (T.gone === null) T.time = Math.max(T.time, at, this.day.techs[k].start);
    });
    const info = this.policy.react(this, ev);
    const after = this.assignment();
    const moved: Moved[] = [];
    for (const [u, from] of before) {
      const to = after.get(u) ?? -1;
      if (to !== from) moved.push({ job: u, from, to });
    }
    moved.sort((a, b) => a.job - b.job);
    const entry: LogEntry = { at, event: ev, info: { ...info, moved } };
    this.log.push(entry);
    return entry;
  }

  /** Runs the rest of the day with no further events. */
  finish(): void {
    this.advance(Infinity);
  }

  /** A copy that knows only what has happened so far: no pending reports, no log. */
  copy(): Sim {
    const c = Object.create(Sim.prototype) as Sim;
    Object.assign(c, this);
    const w = c as unknown as { -readonly [K in keyof Sim]: Sim[K] } & { pending: { job: number; extra: number }[] };
    w.jobs = this.jobs.map((j) => ({ ...j }));
    w.dur = this.dur.slice();
    w.techs = this.techs.map((T) => ({ ...T, visits: T.visits.map((v) => ({ ...v })), legs: T.legs.map((l) => ({ ...l })), plan: T.plan.slice() }));
    w.pool = new Set(this.pool);
    w.trafficEvents = this.trafficEvents.slice();
    w.log = [];
    w.affected = [];
    w.pending = [];
    return c;
  }

  /** End-of-day figures if nothing else happens. */
  projectedOutcome(): Outcome {
    const c = this.copy();
    c.finish();
    const tl = c.timeline();
    return outcome(this.day, c.jobs, tl.visits, tl.legs, tl.ret, c.techs.map((t) => t.gone));
  }

  /** Every visit and leg: what is frozen, then the projection of the rest. */
  timeline(): { visits: Visit[]; legs: Leg[]; skipped: number[]; ret: number[] } {
    const visits: Visit[] = [];
    const legs: Leg[] = [];
    const skipped: number[] = [];
    const ret: number[] = [];
    this.techs.forEach((T, k) => {
      visits.push(...T.visits);
      legs.push(...T.legs);
      const p = this.project(k);
      visits.push(...p.visits);
      legs.push(...p.legs);
      skipped.push(...p.skipped);
      ret.push(T.gone !== null ? T.gone : p.legs.length ? p.ret : T.legs.length ? T.time : this.day.techs[k].start);
    });
    return { visits, legs, skipped, ret };
  }

  // ---------------------------------------------------------------- re-planning helpers

  /** The rest of the day as a routing problem: technicians from where they will next be free, open jobs. */
  problem(): { P: Problem; techOf: number[]; jobOf: number[]; seqs: number[][] } {
    const techOf: number[] = [];
    const vehicles: PVehicle[] = [];
    this.techs.forEach((T, k) => {
      if (T.gone !== null) return;
      const tech = this.day.techs[k];
      techOf.push(k);
      vehicles.push({ ref: k, startLoc: T.node, startTime: T.time, endLoc: tech.depot, shiftEnd: tech.end, hardEnd: tech.end + this.day.otCap, skills: tech.skills, capacity: Infinity });
    });
    const jobOf: number[] = [];
    const local = new Map<number, number>();
    const add = (u: number) => {
      if (local.has(u)) return;
      local.set(u, jobOf.length);
      jobOf.push(u);
    };
    for (const k of techOf) for (const u of this.techs[k].plan) add(u);
    for (const u of [...this.pool].sort((a, b) => a - b)) add(u);
    const home = new Map<number, number>();
    for (const k of techOf) for (const u of this.techs[k].plan) home.set(u, k);
    const jobs: PJob[] = jobOf.map((u) => {
      const j = this.jobs[u];
      const w = PRIO_WEIGHT[j.prio];
      return { ref: u, loc: j.node, e: j.e, l: j.l, dur: this.dur[u], mask: 1 << j.skill, w, demand: 0, miss: missCost(w), home: home.get(u) ?? -1 };
    });
    const seqs = techOf.map((k) => this.techs[k].plan.map((u) => local.get(u)!));
    const P: Problem = { nLoc: this.city.ap.n, ff: this.city.ap.dist, traffic: this.traffic, jobs, vehicles, W: WEIGHTS };
    return { P, techOf, jobOf, seqs };
  }

  setPlans(techOf: number[], jobOf: number[], seqs: number[][], unassigned: number[]): void {
    for (const T of this.techs) if (T.gone === null) T.plan = [];
    techOf.forEach((k, i) => (this.techs[k].plan = seqs[i].map((x) => jobOf[x])));
    this.pool.clear();
    for (const x of unassigned) this.pool.add(jobOf[x]);
  }
}

// ---------------------------------------------------------------- policies

export interface SolverBudget {
  iterations: number;
  deadlineMs?: number;
  seed: string;
}

/** Morning plan: regret-3 construction, then ALNS, for the whole day. */
export function morningProblem(city: City, day: Day): Problem {
  const vehicles: PVehicle[] = day.techs.map((t, k) => ({ ref: k, startLoc: t.depot, startTime: t.start, endLoc: t.depot, shiftEnd: t.end, hardEnd: t.end + day.otCap, skills: t.skills, capacity: Infinity }));
  const jobs: PJob[] = day.jobs.map((j) => {
    const w = PRIO_WEIGHT[j.prio];
    return { ref: j.id, loc: j.node, e: j.e, l: j.l, dur: j.dur, mask: 1 << j.skill, w, demand: 0, miss: missCost(w) };
  });
  return { nLoc: city.ap.n, ff: city.ap.dist, traffic: Traffic.day(), jobs, vehicles, W: WEIGHTS };
}

export interface MorningPlan {
  plans: number[][];
  unassigned: number[];
  stats: AlnsStats;
  constructPlans: number[][];
  constructUnassigned: number[];
}

export function morningPlan(city: City, day: Day, budget: SolverBudget): MorningPlan {
  const P = morningProblem(city, day);
  const s = fromSequences(P, []);
  regretInsert(P, s, 3);
  const constructPlans = s.routes.map((r) => r.seq.map((x) => P.jobs[x].ref));
  const constructUnassigned = s.unassigned.map((x) => P.jobs[x].ref);
  const { best, stats } = alns(P, s, { iterations: budget.iterations, deadlineMs: budget.deadlineMs, seed: budget.seed });
  return { plans: best.routes.map((r) => r.seq.map((x) => P.jobs[x].ref)), unassigned: best.unassigned.map((x) => P.jobs[x].ref), stats, constructPlans, constructUnassigned };
}

/** Dispatch: freeze, warm-start from the current plan, repair, then ALNS under a time budget. */
export function dispatchPolicy(budget: SolverBudget, opts: { search?: boolean } = {}): Policy {
  let n = 0;
  return {
    name: opts.search === false ? "Dispatch, repair only" : "Dispatch",
    react(sim) {
      const t0 = performance.now();
      const { P, techOf, jobOf, seqs } = sim.problem();
      const s = fromSequences(P, seqs);
      enforceCap(P, s);
      regretInsert(P, s, 3);
      let best = s;
      let iterations = 0;
      let hitDeadline = false;
      if (opts.search !== false) {
        const left = budget.deadlineMs === undefined ? undefined : Math.max(0, budget.deadlineMs - (performance.now() - t0));
        const r = alns(P, s, { iterations: budget.iterations, deadlineMs: left, seed: `${budget.seed}:${n++}` });
        best = r.best;
        iterations = r.stats.iterations;
        hitDeadline = r.stats.hitDeadline;
      }
      sim.setPlans(
        techOf,
        jobOf,
        best.routes.map((r) => r.seq),
        best.unassigned,
      );
      return { ms: performance.now() - t0, iterations, hitDeadline, jobsInPlay: P.jobs.length, techsInPlay: P.vehicles.length };
    },
  };
}

/**
 * Baseline: keep the morning plan. Work that loses its technician, and new
 * jobs, go to the end of the day of whichever qualified technician finishes
 * first; overruns and traffic just push the rest of the day back.
 */
export function keepPolicy(): Policy {
  return {
    name: "Morning plan, no re-planning",
    react(sim, ev) {
      const t0 = performance.now();
      if (ev.kind === "sick" || ev.kind === "urgent") {
        // the abandoned visit first, then the rest of that technician's day in order
        for (const u of sim.affected) {
          const j = sim.jobs[u];
          let best = -1;
          let bestEnd = Infinity;
          sim.techs.forEach((T, k) => {
            if (T.gone !== null || !(sim.day.techs[k].skills & (1 << j.skill))) return;
            const p = sim.project(k);
            const end = p.visits.length ? p.visits[p.visits.length - 1].end : T.time;
            if (end < bestEnd) {
              bestEnd = end;
              best = k;
            }
          });
          if (best >= 0) {
            sim.techs[best].plan.push(u);
            sim.pool.delete(u);
          }
        }
      }
      return { ms: performance.now() - t0, iterations: 0, hitDeadline: false, jobsInPlay: sim.pool.size, techsInPlay: 0 };
    },
  };
}
