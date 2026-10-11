// Baseline: a greedy first-come dispatcher with no plan. Jobs wait in a queue
// (urgent ones first, then by when their window opens); whenever technicians
// are free, each job in turn goes to the nearest free technician with the
// skill who would arrive no more than 15 minutes before its window opens and
// could still get home before the overtime cap. It sees the same day and the
// same events as Dispatch.

import type { City } from "./city";
import type { Day, Job } from "./day";
import type { DayEvent, Leg, Visit } from "./sim";
import { Traffic, type TrafficEvent } from "./traffic";

const EARLY = 15;
const EPS = 1e-6;

interface G {
  node: number;
  free: number;
  busy: { leg: Leg; visit: Visit } | null;
  gone: number | null;
}

export interface GreedyResult {
  jobs: Job[];
  visits: Visit[];
  legs: Leg[];
  ret: number[];
  gone: (number | null)[];
}

export function runGreedy(city: City, day: Day, events: readonly DayEvent[]): GreedyResult {
  const n = city.ap.n;
  const ff = (a: number, b: number) => city.ap.dist[a * n + b];
  const jobs: Job[] = day.jobs.map((j) => ({ ...j }));
  const dur = jobs.map((j) => j.dur);
  const extra = new Map<number, number>();
  const timed = events.filter((e) => e.at !== undefined).sort((a, b) => a.at! - b.at!);
  for (const e of events) if (e.kind === "overrun" && e.at === undefined) extra.set(e.job, (extra.get(e.job) ?? 0) + e.extra);
  const trafficEvents: TrafficEvent[] = [];
  let tr = Traffic.day();
  const techs: G[] = day.techs.map((t) => ({ node: t.depot, free: t.start, busy: null, gone: null }));
  const visits: Visit[] = [];
  const legs: Leg[] = [];
  const queue = new Set<number>(jobs.filter((j) => j.release === 0).map((j) => j.id));
  const served = new Set<number>();
  let urgentCount = 0;

  const order = () =>
    [...queue].sort((a, b) => {
      const A = jobs[a];
      const B = jobs[b];
      return (A.kind === "urgent" ? 0 : 1) - (B.kind === "urgent" ? 0 : 1) || A.e - B.e || A.id - B.id;
    });

  const apply = (ev: DayEvent) => {
    const at = ev.at!;
    if (ev.kind === "sick") {
      const T = techs[ev.tech];
      if (T.gone !== null) return;
      T.gone = at;
      if (T.busy && T.busy.visit.end > at + EPS) {
        const { leg, visit } = T.busy;
        visit.abandoned = true;
        if (visit.start > at) visit.arrive = visit.start = visit.end = at;
        else visit.end = at;
        if (leg.arrive > at + EPS) leg.cut = at;
        queue.add(visit.job);
      }
      T.busy = null;
    } else if (ev.kind === "urgent") {
      const id = jobs.length;
      urgentCount++;
      const win = ev.window ?? 120;
      jobs.push({ id, label: `U-${urgentCount}`, task: ev.task, node: ev.node, e: at, l: at + win, dur: ev.dur, skill: ev.skill, prio: 3, kind: "urgent", release: at });
      dur.push(ev.dur);
      queue.add(id);
    } else if (ev.kind === "overrun") {
      const T = techs.find((x) => x.busy?.visit.job === ev.job);
      if (T && T.busy) {
        T.busy.visit.end += ev.extra;
      } else if (!served.has(ev.job)) dur[ev.job] += ev.extra;
    } else {
      trafficEvents.push({ at, factor: ev.factor });
      tr = Traffic.day(trafficEvents);
      for (const T of techs) {
        if (!T.busy || T.gone !== null) continue;
        const { leg, visit } = T.busy;
        if (leg.depart <= at && leg.arrive > at + EPS) {
          leg.arrive = tr.arrive(ff(leg.from, leg.to), leg.depart);
          const j = jobs[visit.job];
          visit.arrive = leg.arrive;
          visit.start = Math.max(leg.arrive, j.e);
          visit.end = visit.start + dur[visit.job] + (extra.get(visit.job) ?? 0);
        }
      }
    }
  };

  const dispatch = (t: number) => {
    const free = new Set<number>();
    techs.forEach((T, k) => {
      if (T.gone === null && !T.busy && day.techs[k].start <= t + EPS) free.add(k);
    });
    if (!free.size) return;
    for (const u of order()) {
      if (!free.size) break;
      const j = jobs[u];
      let best = -1;
      let bestArr = Infinity;
      for (const k of free) {
        const tech = day.techs[k];
        if (!(tech.skills & (1 << j.skill))) continue;
        const T = techs[k];
        const arr = tr.arrive(ff(T.node, j.node), t);
        if (arr < j.e - EARLY - EPS) continue;
        const end = Math.max(arr, j.e) + dur[u];
        if (tr.arrive(ff(j.node, tech.depot), end) > tech.end + day.otCap + EPS) continue;
        if (arr < bestArr - EPS) {
          bestArr = arr;
          best = k;
        }
      }
      if (best < 0) continue;
      const T = techs[best];
      const start = Math.max(bestArr, j.e);
      const leg: Leg = { tech: best, from: T.node, to: j.node, depart: t, arrive: bestArr, job: u };
      const visit: Visit = { job: u, tech: best, arrive: bestArr, start, end: start + dur[u] + (extra.get(u) ?? 0) };
      legs.push(leg);
      visits.push(visit);
      T.busy = { leg, visit };
      queue.delete(u);
      free.delete(best);
    }
  };

  let t = Math.min(...day.techs.map((x) => x.start));
  let ei = 0;
  for (let guard = 0; guard < 100_000; guard++) {
    while (ei < timed.length && timed[ei].at! <= t + EPS) apply(timed[ei++]);
    techs.forEach((T) => {
      if (T.busy && T.busy.visit.end <= t + EPS) {
        served.add(T.busy.visit.job);
        T.node = jobs[T.busy.visit.job].node;
        T.free = T.busy.visit.end;
        T.busy = null;
      }
    });
    dispatch(t);
    // next moment anything can change
    let next = Infinity;
    if (ei < timed.length) next = Math.min(next, timed[ei].at!);
    techs.forEach((T, k) => {
      if (T.gone !== null) return;
      if (T.busy) next = Math.min(next, T.busy.visit.end);
      else if (day.techs[k].start > t + EPS) next = Math.min(next, day.techs[k].start);
      else {
        for (const u of queue) {
          const j = jobs[u];
          if (!(day.techs[k].skills & (1 << j.skill))) continue;
          const f = ff(T.node, j.node);
          if (tr.arrive(f, t) < j.e - EARLY - EPS) {
            const when = tr.latestDepart(f, j.e - EARLY);
            if (when > t + EPS) next = Math.min(next, when);
          }
        }
      }
    });
    if (next === Infinity) break;
    t = next;
  }

  // everyone still working drives home after their last visit
  const ret = techs.map((T, k) => {
    if (T.gone !== null) return T.gone;
    const tech = day.techs[k];
    if (T.node === tech.depot) return T.free;
    const arrive = tr.arrive(ff(T.node, tech.depot), T.free);
    legs.push({ tech: k, from: T.node, to: tech.depot, depart: T.free, arrive, job: -1 });
    return arrive;
  });
  return { jobs, visits, legs, ret, gone: techs.map((T) => T.gone) };
}
