// The dispatcher runs here, off the main thread, on the same core modules the
// evaluation measured. On start it regenerates the city and the day from their
// seeds, checks the day's SHA-256 against the build manifest, and solves the
// morning plan. Each event (scripted, or caused on the page) re-plans the rest
// of the day with Dispatch, and replays the same events on the two baselines.

import manifest from "../generated/day.json";
import { generateCity, type City } from "../core/city";
import { DEMO_SEED, DEMO_SICK_AT, MORNING_ITERATIONS, REPLAN_DEADLINE_MS, REPLAN_ITERATIONS } from "../core/config";
import { generateDay, sampleDuration, SKILLS, urgentTask, type Day } from "../core/day";
import { canonical } from "../core/fingerprint";
import { pathBetween } from "../core/graph";
import { runGreedy } from "../core/greedy";
import { outcome } from "../core/metrics";
import { Rng } from "../core/rng";
import { scriptedEvents } from "../core/scenario";
import { dispatchPolicy, keepPolicy, morningPlan, Sim, type DayEvent, type LogEntry, type MorningPlan } from "../core/sim";
import type { InitData, LogView, Request, Response, Snapshot, UserEvent } from "./protocol";

let city: City;
let day: Day;
let mp: MorningPlan;
let script: DayEvent[] = [];
let sim: Sim;
let keep: Sim;
let applied: DayEvent[] = [];
let pendingScript: DayEvent[] = [];
let scripted = true;
let userUrgent = 0;
let rng: Rng;
const userAt = new Set<LogEntry>();

const post = (m: Response) => (self as unknown as Worker).postMessage(m);

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

function start(withScript: boolean) {
  scripted = withScript;
  const budget = { iterations: REPLAN_ITERATIONS, deadlineMs: REPLAN_DEADLINE_MS, seed: `replan:${DEMO_SEED}` };
  sim = new Sim(city, day, mp.plans, mp.unassigned, dispatchPolicy(budget));
  keep = new Sim(city, day, mp.plans, mp.unassigned, keepPolicy());
  applied = [];
  userUrgent = 0;
  userAt.clear();
  rng = new Rng(`page:${DEMO_SEED}`);
  pendingScript = withScript ? script.filter((e) => e.at !== undefined) : [];
  if (withScript) {
    for (const e of script.filter((x) => x.at === undefined)) {
      sim.apply(e);
      keep.apply(e);
      applied.push(e);
    }
  }
}

function applyBoth(e: DayEvent, user = false) {
  const entry = sim.apply(e);
  if (entry && user) userAt.add(entry);
  keep.apply(e);
  applied.push(e);
}

/** Applies scripted events (and overruns that fall due) up to t. */
function advance(t: number) {
  for (;;) {
    const next = pendingScript[0];
    if (next && next.at! <= t) {
      pendingScript.shift();
      applyBoth(next);
      continue;
    }
    break;
  }
  sim.advance(t);
  keep.advance(t);
}

function describe(e: DayEvent, s: Sim): string {
  switch (e.kind) {
    case "sick":
      return `${day.techs[e.tech].name} goes home`;
    case "urgent": {
      const j = s.jobs.find((x) => x.release === e.at && x.node === e.node && x.kind === "urgent");
      return `Urgent ${SKILLS[e.skill].toLowerCase()} job${j ? ` ${j.label}` : ""}, start within 2 h`;
    }
    case "overrun":
      return `${s.jobs[e.job].label} overruns by ${e.extra} min`;
    case "traffic":
      return e.factor === 1 ? "Traffic back to normal" : `Traffic ${e.factor.toFixed(1)}× slower`;
  }
}

function snapshot(): Snapshot {
  const tl = sim.timeline();
  const frozen = new Set(sim.techs.flatMap((T) => T.visits));
  const visits = tl.visits.map((v) => {
    const j = sim.jobs[v.job];
    return { job: v.job, tech: v.tech, arrive: v.arrive, start: v.start, end: v.end, late: Math.max(0, v.start - j.l), abandoned: v.abandoned, frozen: frozen.has(v) };
  });
  const legs = tl.legs.map((l) => ({ tech: l.tech, job: l.job, depart: l.depart, arrive: l.arrive, cut: l.cut, path: pathBetween(city.ap, l.from, l.to) }));

  // projected end of day for all three, with the events so far
  const g = runGreedy(city, day, applied);
  const compare = { dispatch: sim.projectedOutcome(), keep: keep.projectedOutcome(), greedy: outcome(day, g.jobs, g.visits, g.legs, g.ret, g.gone) };

  const log: LogView[] = sim.log.map((l) => ({
    at: l.at,
    kind: l.event.kind,
    text: describe(l.event, sim),
    ms: l.info.ms,
    iterations: l.info.iterations,
    hitDeadline: l.info.hitDeadline,
    jobsInPlay: l.info.jobsInPlay,
    moved: l.info.moved,
    user: userAt.has(l),
  }));
  const nextScript = pendingScript[0]?.at ?? null;
  const nextOver = sim.nextAuto();
  const nextAuto = nextScript === null ? nextOver : nextOver === null ? nextScript : Math.min(nextScript, nextOver);
  const lastTraffic = sim.trafficEvents[sim.trafficEvents.length - 1];
  return {
    now: sim.now,
    jobs: sim.jobs.map((j) => ({ id: j.id, label: j.label, task: j.task, node: j.node, e: j.e, l: j.l, dur: sim.dur[j.id], skill: j.skill, prio: j.prio, kind: j.kind, release: j.release })),
    techs: day.techs.map((t, k) => ({ id: t.id, name: t.name, skills: t.skills, depot: t.depot, start: t.start, end: t.end, hardEnd: t.end + day.otCap, gone: sim.techs[k].gone })),
    visits,
    legs,
    pool: [...sim.pool],
    skipped: tl.skipped,
    log,
    compare,
    nextAuto,
    factor: lastTraffic ? lastTraffic.factor : 1,
    scripted,
    userUrgent,
  };
}

function userEvent(at: number, u: UserEvent): DayEvent {
  switch (u.kind) {
    case "sick":
      return { kind: "sick", at, tech: u.tech };
    case "traffic":
      return { kind: "traffic", at, factor: u.factor };
    case "urgent": {
      userUrgent++;
      return { kind: "urgent", at, node: u.node, skill: u.skill, dur: sampleDuration(rng, u.skill), task: urgentTask(rng, u.skill) };
    }
    case "overrun": {
      const T = sim.techs[u.tech];
      const v = T.visits[T.visits.length - 1];
      if (!v || v.abandoned || v.end <= at) throw new Error(`${day.techs[u.tech].name} has no job under way`);
      return { kind: "overrun", at, job: v.job, extra: u.extra };
    }
  }
}

async function handle(req: Request): Promise<unknown> {
  switch (req.type) {
    case "init": {
      city = generateCity(manifest.citySeed);
      day = generateDay(city, manifest.daySeed);
      script = scriptedEvents(city, day, { sickAt: DEMO_SICK_AT });
      const sha = await sha256(canonical(city, day, script));
      const t0 = performance.now();
      mp = morningPlan(city, day, { iterations: MORNING_ITERATIONS, seed: `morning:${DEMO_SEED}` });
      const ms = performance.now() - t0;
      // the plan played with no disruptions, scored as the evaluation scores it
      const plain = new Sim(city, day, mp.plans, mp.unassigned, keepPolicy());
      plain.finish();
      const ptl = plain.timeline();
      const plainOutcome = outcome(day, plain.jobs, ptl.visits, ptl.legs, ptl.ret, plain.techs.map((t) => t.gone));
      start(true);
      const out: InitData = {
        city: {
          width: city.width,
          height: city.height,
          xs: Array.from(city.xs),
          ys: Array.from(city.ys),
          roads: city.roads.map((r) => [r.a, r.b, r.cls]),
          river: city.river,
          riverWidth: city.riverWidth,
          depots: city.depots,
        },
        seed: day.seed,
        verify: { sha256: sha, expected: manifest.sha256, ok: sha === manifest.sha256 },
        morning: { ms, iterations: mp.stats.iterations, jobs: day.jobs.length, techs: day.techs.length, outcome: plainOutcome },
        scriptedEvents: script,
        snap: snapshot(),
      };
      return out;
    }
    case "reset":
      start(req.scripted);
      return snapshot();
    case "advance":
      advance(req.to);
      return snapshot();
    case "event": {
      advance(req.at);
      applyBoth(userEvent(req.at, req.event), true);
      return snapshot();
    }
  }
}

// one request at a time, in order
let chain: Promise<void> = Promise.resolve();
self.onmessage = (e: MessageEvent<{ id: number; req: Request }>) => {
  const { id, req } = e.data;
  chain = chain.then(async () => {
    try {
      post({ id, ok: true, data: await handle(req) });
    } catch (err) {
      post({ id, ok: false, error: String((err as Error).message ?? err) });
    }
  });
};
