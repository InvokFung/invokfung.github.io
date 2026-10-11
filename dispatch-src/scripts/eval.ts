// Replays seeded synthetic days in Node with scripted disruptions and scores
// Dispatch against two baselines on the same days and the same events. Also
// times every re-plan, compares the solver with its construction heuristic on
// undisrupted days, and, if bench/solomon/ holds instances, measures the gap
// to their best-known solutions. Writes src/generated/eval.json for the page
// and the README's results table. Nothing on the page that claims a
// measurement is typed by hand.
//
//   npm run eval                 120 days
//   npm run eval -- --days 20    a quicker run

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCity } from "../src/core/city";
import { DEMO_SEED, DEMO_SICK_AT, MORNING_ITERATIONS, Q_FRAC, Q_MAX, REPLAN_DEADLINE_MS, REPLAN_ITERATIONS } from "../src/core/config";
import { clock, generateDay, type Day } from "../src/core/day";
import { runGreedy } from "../src/core/greedy";
import { outcome, type Outcome } from "../src/core/metrics";
import { scriptedEvents } from "../src/core/scenario";
import { dispatchPolicy, keepPolicy, morningPlan, Sim, type DayEvent, type MorningPlan, type Policy } from "../src/core/sim";
import { parseSolutionCost, parseVrplib, solomonProblem } from "../src/core/solomon";
import { solve } from "../src/core/solver";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const DAYS = arg("days", 120);
const SOLOMON_ITER = arg("solomon-iterations", 5000);

const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};

const city = generateCity();
console.log(`city "${city.seed}": ${city.xs.length} intersections, ${city.roads.length} roads · Node ${process.version}`);

type Method = "dispatch" | "repair" | "keep" | "greedy";
const METHODS: { key: Method; label: string }[] = [
  { key: "dispatch", label: "Dispatch (re-plans every event)" },
  { key: "repair", label: "Dispatch, repair only (no search)" },
  { key: "keep", label: "Morning plan, no re-planning" },
  { key: "greedy", label: "Greedy nearest free technician" },
];

function runSim(day: Day, mp: MorningPlan, events: readonly DayEvent[], policy: Policy) {
  const sim = new Sim(city, day, mp.plans, mp.unassigned, policy);
  for (const e of events) sim.apply(e);
  sim.finish();
  const tl = sim.timeline();
  return { sim, o: outcome(day, sim.jobs, tl.visits, tl.legs, tl.ret, sim.techs.map((t) => t.gone)) };
}

function runPlain(day: Day, plans: number[][], unassigned: number[]): Outcome {
  const sim = new Sim(city, day, plans, unassigned, keepPolicy());
  sim.finish();
  const tl = sim.timeline();
  return outcome(day, sim.jobs, tl.visits, tl.legs, tl.ret, sim.techs.map((t) => t.gone));
}

interface DayRow {
  seed: string;
  techs: number;
  jobs: number;
  /** Jobs booked before the day starts (the urgent ones come later). */
  baseJobs: number;
  morningMs: number;
  undisrupted: { construct: Outcome; alns: Outcome };
  disrupted: Record<Method, Outcome>;
  replans: { kind: string; ms: number; iterations: number; hitDeadline: boolean; moved: number; jobsInPlay: number }[];
  /** Latency of the same re-plans with the search switched off (repair only). */
  repairMs: number[];
}

function runDay(seed: string, sickAt?: number): DayRow & { events: DayEvent[]; log: { at: number; kind: string; ms: number; moved: number }[] } {
  const day = generateDay(city, seed);
  const t0 = performance.now();
  const mp = morningPlan(city, day, { iterations: MORNING_ITERATIONS, seed: `morning:${seed}` });
  const morningMs = performance.now() - t0;
  const undisrupted = { construct: runPlain(day, mp.constructPlans, mp.constructUnassigned), alns: runPlain(day, mp.plans, mp.unassigned) };
  const events = scriptedEvents(city, day, sickAt === undefined ? {} : { sickAt });
  const budget = { iterations: REPLAN_ITERATIONS, deadlineMs: REPLAN_DEADLINE_MS, seed: `replan:${seed}` };
  const D = runSim(day, mp, events, dispatchPolicy(budget));
  const R = runSim(day, mp, events, dispatchPolicy(budget, { search: false }));
  const K = runSim(day, mp, events, keepPolicy());
  const g = runGreedy(city, day, events);
  const G = outcome(day, g.jobs, g.visits, g.legs, g.ret, g.gone);
  return {
    seed,
    techs: day.techs.length,
    jobs: D.o.jobs,
    baseJobs: day.jobs.length,
    morningMs,
    undisrupted,
    disrupted: { dispatch: D.o, repair: R.o, keep: K.o, greedy: G },
    replans: D.sim.log.map((l) => ({ kind: l.event.kind, ms: l.info.ms, iterations: l.info.iterations, hitDeadline: l.info.hitDeadline, moved: l.info.moved.length, jobsInPlay: l.info.jobsInPlay })),
    repairMs: R.sim.log.map((l) => l.info.ms),
    events,
    log: D.sim.log.map((l) => ({ at: round(l.at, 2), kind: l.event.kind, ms: round(l.info.ms, 2), moved: l.info.moved.length })),
  };
}

// warm the JIT once so the first day's re-plan timings are not compile time
runDay("warm-up");

const rows: DayRow[] = [];
const t0 = performance.now();
for (let d = 1; d <= DAYS; d++) {
  const seed = `day-${String(d).padStart(3, "0")}`;
  const r = runDay(seed);
  rows.push(r);
  if (d % 10 === 0 || d === DAYS) {
    const D = r.disrupted;
    console.log(
      `  ${seed}: ${r.techs} techs ${r.jobs} jobs · on time ${(D.dispatch.onTimeRate * 100).toFixed(1)}% / keep ${(D.keep.onTimeRate * 100).toFixed(1)}% / greedy ${(D.greedy.onTimeRate * 100).toFixed(1)}% · ${((performance.now() - t0) / 1000).toFixed(0)} s`,
    );
  }
}

// ---------------------------------------------------------------- aggregate
function summary(get: (r: DayRow) => Outcome) {
  const os = rows.map(get);
  const sum = (k: keyof Outcome) => os.reduce((a, o) => a + (o[k] as number), 0);
  const jobs = sum("jobs");
  return {
    jobs,
    served: sum("served"),
    missed: sum("missed"),
    completedRate: round(sum("served") / jobs),
    onTime: sum("onTime"),
    onTimeRate: round(sum("onTime") / jobs),
    lateJobs: sum("lateJobs"),
    weightedLatePerDay: round(sum("weightedLate") / os.length, 1),
    lateMinPerDay: round(sum("lateMin") / os.length, 1),
    driveMinPerDay: round(sum("driveMin") / os.length, 1),
    overtimeMinPerDay: round(sum("overtimeMin") / os.length, 1),
    urgent: sum("urgent"),
    urgentOnTime: sum("urgentOnTime"),
    daysAllOnTime: os.filter((o) => o.onTime === o.jobs).length,
    daysAllServed: os.filter((o) => o.missed === 0).length,
  };
}

const methods = METHODS.map((m) => ({ key: m.key, label: m.label, ...summary((r) => r.disrupted[m.key]) }));
const replans = rows.flatMap((r) => r.replans);
const ms = replans.map((r) => r.ms);
const sickMs = replans.filter((r) => r.kind === "sick").map((r) => r.ms);
const latency = {
  count: replans.length,
  p50: round(quantile(ms, 0.5), 2),
  p95: round(quantile(ms, 0.95), 2),
  max: round(Math.max(...ms), 2),
  sickP50: round(quantile(sickMs, 0.5), 2),
  sickP95: round(quantile(sickMs, 0.95), 2),
  hitDeadline: replans.filter((r) => r.hitDeadline).length,
  iterationsP50: Math.round(quantile(
    replans.map((r) => r.iterations),
    0.5,
  )),
  movedP50: quantile(
    replans.filter((r) => r.kind === "sick").map((r) => r.moved),
    0.5,
  ),
  jobsInPlayP50: quantile(
    replans.map((r) => r.jobsInPlay),
    0.5,
  ),
  repairP50: round(quantile(rows.flatMap((r) => r.repairMs), 0.5), 2),
  repairP95: round(quantile(rows.flatMap((r) => r.repairMs), 0.95), 2),
  repairMax: round(Math.max(...rows.flatMap((r) => r.repairMs)), 2),
};

const und = {
  construct: summary((r) => r.undisrupted.construct),
  alns: summary((r) => r.undisrupted.alns),
  morningMsP50: round(quantile(
    rows.map((r) => r.morningMs),
    0.5,
  ), 1),
  morningMsMax: round(Math.max(...rows.map((r) => r.morningMs)), 1),
};
const driveCut = round(1 - und.alns.driveMinPerDay / und.construct.driveMinPerDay);

// head to head per day
const wins = {
  vsKeep: rows.filter((r) => r.disrupted.dispatch.onTime > r.disrupted.keep.onTime).length,
  tiesKeep: rows.filter((r) => r.disrupted.dispatch.onTime === r.disrupted.keep.onTime).length,
  vsGreedy: rows.filter((r) => r.disrupted.dispatch.onTime > r.disrupted.greedy.onTime).length,
  tiesGreedy: rows.filter((r) => r.disrupted.dispatch.onTime === r.disrupted.greedy.onTime).length,
};

// ---------------------------------------------------------------- the day on the page
const demo = runDay(DEMO_SEED, DEMO_SICK_AT);
console.log(`demo day "${DEMO_SEED}": on time ${(demo.disrupted.dispatch.onTimeRate * 100).toFixed(1)}% · ${demo.log.map((l) => `${clock(l.at)} ${l.kind} ${l.ms.toFixed(1)} ms`).join(", ")}`);

// ---------------------------------------------------------------- Solomon
const SOL = join(ROOT, "bench", "solomon");
const solomon: { name: string; distance: number; bks: number; gap: number; vehicles: number; bksVehicles: number; late: number; unassigned: number; ms: number }[] = [];
if (existsSync(SOL)) {
  const names = readdirSync(SOL)
    .filter((f) => f.endsWith(".vrp") && existsSync(join(SOL, f.replace(".vrp", ".sol"))))
    .map((f) => f.replace(".vrp", ""))
    .sort();
  for (const name of names) {
    const inst = parseVrplib(readFileSync(join(SOL, `${name}.vrp`), "utf8"));
    const bks = parseSolutionCost(readFileSync(join(SOL, `${name}.sol`), "utf8"));
    const P = solomonProblem(inst);
    const s0 = performance.now();
    const { best } = solve(P, { iterations: SOLOMON_ITER, seed: `solomon:${name}` });
    const dist = best.routes.reduce((a, r) => a + r.drive, 0);
    const late = best.routes.reduce((a, r) => a + r.lateW, 0);
    const row = {
      name,
      distance: round(dist, 1),
      bks: bks.cost,
      gap: round(dist / bks.cost - 1, 5),
      vehicles: best.routes.filter((r) => r.seq.length).length,
      bksVehicles: bks.routes,
      late: round(late, 2),
      unassigned: best.unassigned.length,
      ms: round(performance.now() - s0, 0),
    };
    solomon.push(row);
    console.log(`  Solomon ${name}: ${row.distance} vs ${row.bks} (${(row.gap * 100).toFixed(2)}%), ${row.vehicles} vehicles, ${row.ms} ms`);
  }
}
const solomonSummary = solomon.length
  ? {
      instances: solomon.length,
      meanGap: round(solomon.reduce((a, r) => a + r.gap, 0) / solomon.length, 5),
      maxGap: round(Math.max(...solomon.map((r) => r.gap)), 5),
      atBks: solomon.filter((r) => r.gap <= 1e-6).length,
      allFeasible: solomon.every((r) => r.late === 0 && r.unassigned === 0),
      iterations: SOLOMON_ITER,
    }
  : null;

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  citySeed: city.seed,
  days: rows.length,
  techsRange: [Math.min(...rows.map((r) => r.techs)), Math.max(...rows.map((r) => r.techs))],
  jobsRange: [Math.min(...rows.map((r) => r.jobs)), Math.max(...rows.map((r) => r.jobs))],
  budgets: { morningIterations: MORNING_ITERATIONS, replanIterations: REPLAN_ITERATIONS, replanDeadlineMs: REPLAN_DEADLINE_MS, qMax: Q_MAX, qFrac: Q_FRAC },
  scenario: "one technician sent home at a random time between 09:00 and 11:00, 2-3 urgent jobs called in between 10:00 and 15:30 (each to start within 2 h), one job overrunning by 40-75 min, and a 1.4-1.8x traffic spike starting between 15:00 and 16:00 and lasting 60-90 min",
  daysAtJobFloor: rows.filter((r) => r.baseJobs === 60).length,
  methods,
  wins,
  latency,
  undisrupted: { ...und, driveCut },
  demo: { seed: DEMO_SEED, techs: demo.techs, jobs: demo.jobs, disrupted: demo.disrupted, undisrupted: demo.undisrupted, log: demo.log, morningMs: round(demo.morningMs, 1) },
  solomon,
  solomonSummary,
};
writeFileSync(join(ROOT, "src", "generated", "eval.json"), JSON.stringify(report, null, 1) + "\n");

// ---------------------------------------------------------------- README table
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const int = (x: number) => Math.round(x).toLocaleString("en-US");
const m = Object.fromEntries(methods.map((x) => [x.key, x])) as Record<Method, (typeof methods)[number]>;
const lines = [
  `${rows.length} synthetic days (${report.techsRange[0]}-${report.techsRange[1]} technicians, ${report.jobsRange[0]}-${report.jobsRange[1]} jobs a day, ${int(m.dispatch.jobs)} jobs in all), each with the same scripted disruptions for every method: ${report.scenario}.`,
  "",
  "| Method | Jobs completed | On time | Priority-weighted lateness, min/day | Drive, min/day | Overtime, min/day |",
  "| --- | --- | --- | --- | --- | --- |",
  ...methods.map((x) => {
    const b = x.key === "dispatch" ? "**" : "";
    return `| ${b}${x.label}${b} | ${b}${pct(x.completedRate)}${b} (${int(x.served)}/${int(x.jobs)}) | ${b}${pct(x.onTimeRate)}${b} | ${x.weightedLatePerDay.toFixed(1)} | ${int(x.driveMinPerDay)} | ${int(x.overtimeMinPerDay)} |`;
  }),
  "",
  "| Measure | Result |",
  "| --- | --- |",
  `| Re-plan latency, p50 / p95 / max (Node ${process.version}) | ${latency.p50.toFixed(1)} / ${latency.p95.toFixed(1)} / ${latency.max.toFixed(1)} ms over ${int(latency.count)} re-plans; ${latency.hitDeadline} stopped at the ${REPLAN_DEADLINE_MS} ms deadline |`,
  `| Re-plan after a sick call, p50 / p95 | ${latency.sickP50.toFixed(1)} / ${latency.sickP95.toFixed(1)} ms; median ${latency.movedP50} jobs changed technician |`,
  `| Repair alone (before the search), p50 / p95 / max | ${latency.repairP50.toFixed(2)} / ${latency.repairP95.toFixed(2)} / ${latency.repairMax.toFixed(2)} ms |`,
  `| Days where Dispatch had more visits on time than the morning plan / than greedy | ${wins.vsKeep} / ${wins.vsGreedy} of ${rows.length} (ties ${wins.tiesKeep} / ${wins.tiesGreedy}) |`,
  `| Urgent jobs started within 2 h: Dispatch / morning plan / greedy | ${m.dispatch.urgentOnTime} / ${m.keep.urgentOnTime} / ${m.greedy.urgentOnTime} of ${m.dispatch.urgent} |`,
  `| Undisrupted days, ALNS vs regret-3 construction alone: drive min/day | ${int(und.alns.driveMinPerDay)} vs ${int(und.construct.driveMinPerDay)} (${pct(driveCut)} less); on time ${pct(und.alns.onTimeRate)} vs ${pct(und.construct.onTimeRate)}; overtime ${int(und.alns.overtimeMinPerDay)} vs ${int(und.construct.overtimeMinPerDay)} min/day |`,
  `| Morning plan (${MORNING_ITERATIONS} ALNS iterations), median / max time | ${und.morningMsP50.toFixed(0)} / ${und.morningMsMax.toFixed(0)} ms |`,
  solomonSummary
    ? `| Solomon VRPTW, gap to best-known distance (${solomonSummary.instances} instances, ${SOLOMON_ITER} iterations each) | mean ${(solomonSummary.meanGap * 100).toFixed(2)}%, max ${(solomonSummary.maxGap * 100).toFixed(2)}%; ${solomonSummary.atBks} matched the best-known cost; ${solomonSummary.allFeasible ? "all on time and within capacity" : "some infeasible"} |`
    : "| Solomon VRPTW | skipped: no instances in bench/solomon (run `npm run solomon`) |",
];
if (solomon.length) {
  lines.push("", "| Solomon instance | Distance | Best known | Gap | Vehicles (best known) |", "| --- | --- | --- | --- | --- |");
  for (const s of solomon) lines.push(`| ${s.name} | ${s.distance.toFixed(1)} | ${s.bks.toFixed(1)} | ${(Math.abs(s.gap) < 5e-5 ? 0 : s.gap * 100).toFixed(2)}% | ${s.vehicles} (${s.bksVehicles}) |`);
}
const readmePath = join(ROOT, "README.md");
try {
  const readme = readFileSync(readmePath, "utf8");
  const start = "<!-- eval:start -->";
  const end = "<!-- eval:end -->";
  if (readme.includes(start) && readme.includes(end)) {
    writeFileSync(readmePath, readme.slice(0, readme.indexOf(start) + start.length) + "\n" + lines.join("\n") + "\n" + readme.slice(readme.indexOf(end)));
  }
} catch {
  // no README yet
}
console.log("\n" + lines.join("\n"));
