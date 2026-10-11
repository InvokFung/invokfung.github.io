import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCity } from "../src/core/city";
import { generateDay, type Day } from "../src/core/day";
import { dispatchPolicy, keepPolicy, morningPlan, Sim, type DayEvent, type Visit } from "../src/core/sim";
import { scriptedEvents } from "../src/core/scenario";
import { outcome } from "../src/core/metrics";
import { runGreedy } from "../src/core/greedy";

const city = generateCity();
const full = generateDay(city, "unit-day");
/** A small, comfortable day: four technicians, twenty jobs. */
const small: Day = (() => {
  const techs = full.techs.slice(0, 4).map((t, i) => ({ ...t, id: i, skills: 0b11111 }));
  const jobs = full.jobs.slice(0, 20).map((j, i) => ({ ...j, id: i }));
  return { ...full, techs, jobs };
})();
const budget = { iterations: 300, seed: "unit" };

const key = (v: Visit) => `${v.job}@${v.tech}:${v.start.toFixed(6)}`;

test("end to end: an easy day is served in full, every visit by a qualified technician inside its window", () => {
  const mp = morningPlan(city, small, budget);
  assert.equal(mp.unassigned.length, 0);
  const sim = new Sim(city, small, mp.plans, mp.unassigned, dispatchPolicy(budget));
  sim.finish();
  const tl = sim.timeline();
  const o = outcome(small, sim.jobs, tl.visits, tl.legs, tl.ret, sim.techs.map((t) => t.gone));
  assert.equal(o.served, small.jobs.length);
  assert.equal(o.onTime, small.jobs.length);
  for (const v of tl.visits) {
    const j = sim.jobs[v.job];
    assert.ok(small.techs[v.tech].skills & (1 << j.skill));
    assert.ok(v.start >= j.e - 1e-6 && v.start <= j.l + 1e-6);
  }
  // legs and visits chain: each technician leaves after finishing the last visit
  sim.techs.forEach((T) => {
    for (let i = 1; i < T.visits.length; i++) assert.ok(T.legs[i].depart >= T.visits[i - 1].end - 1e-6);
  });
});

test("re-planning: frozen visits never move, the absent technician gets nothing after leaving, new jobs get placed", () => {
  const mp = morningPlan(city, full, budget);
  const sim = new Sim(city, full, mp.plans, mp.unassigned, dispatchPolicy({ iterations: 200, seed: "unit-r" }));
  const events = scriptedEvents(city, full);
  const sick = events.find((e) => e.kind === "sick") as Extract<DayEvent, { kind: "sick" }>;
  let frozen: string[] = [];
  for (const ev of events) {
    sim.apply(ev);
    const now = sim.techs.flatMap((T) => T.visits.filter((v) => !v.abandoned && v.end <= sim.now).map(key));
    for (const k of frozen) assert.ok(now.includes(k), `finished visit ${k} moved or vanished`);
    frozen = now;
  }
  const gone = sim.techs[sick.tech];
  assert.equal(gone.gone, sick.at);
  assert.equal(gone.plan.length, 0);
  assert.ok(gone.visits.every((v) => v.start <= sick.at + 1e-6), "no visit for the absent technician after the call");
  const urgent = sim.jobs.filter((j) => j.kind === "urgent");
  assert.ok(urgent.length >= 2);
  sim.finish();
  const tl = sim.timeline();
  const served = new Set(tl.visits.filter((v) => !v.abandoned).map((v) => v.job));
  for (const u of urgent) assert.ok(served.has(u.id), `urgent ${u.label} served`);
  const log = sim.log.filter((l) => l.event.kind !== "traffic" || l.info.jobsInPlay > 1);
  assert.ok(log.every((l) => l.info.ms >= 0));
  assert.ok(sim.log.some((l) => l.info.moved.length > 0), "the sick call moved some jobs");
});

test("re-planning: a visit already under way stays with its technician through a re-plan", () => {
  const mp = morningPlan(city, full, budget);
  const sim = new Sim(city, full, mp.plans, mp.unassigned, dispatchPolicy({ iterations: 150, seed: "unit-w" }));
  sim.advance(615);
  const underway = sim.techs.map((T) => T.visits[T.visits.length - 1]).filter((v) => v && v.end > 615);
  assert.ok(underway.length > 0);
  sim.apply({ kind: "traffic", at: 615, factor: 1.8 });
  for (const v of underway) {
    const T = sim.techs[v.tech];
    assert.ok(T.visits.includes(v), "still the technician's visit");
    assert.ok(!T.plan.includes(v.job), "not planned again");
  }
});

test("baselines: the keep-the-plan policy pushes the absent technician's work to the end of someone's day; greedy respects skills", () => {
  const mp = morningPlan(city, full, budget);
  const events = scriptedEvents(city, full);
  const sick = events.find((e) => e.kind === "sick") as Extract<DayEvent, { kind: "sick" }>;
  const sim = new Sim(city, full, mp.plans, mp.unassigned, keepPolicy());
  const moved = sim.techs[sick.tech].plan.slice();
  const tails = new Map<number, number[]>();
  sim.apply(sick);
  sim.techs.forEach((T, k) => tails.set(k, T.plan.slice()));
  const pushed = moved.filter((u) => sim.techs.some((T) => T.plan.includes(u)));
  assert.ok(pushed.length > 0);
  for (const u of pushed) {
    const k = sim.techs.findIndex((T) => T.plan.includes(u));
    const plan = tails.get(k)!;
    // every pushed job sits after all of that technician's own jobs
    const own = plan.filter((x) => !moved.includes(x));
    assert.ok(plan.indexOf(u) > Math.max(-1, ...own.map((x) => plan.indexOf(x))));
  }
  const g = runGreedy(city, full, events);
  for (const v of g.visits) assert.ok(full.techs[v.tech].skills & (1 << g.jobs[v.job].skill));
  const again = runGreedy(city, full, events);
  assert.deepEqual(again.visits, g.visits);
});
