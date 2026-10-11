// How it is built: the parts, the decisions behind them, and what they cost.
// Figures in the prose come from eval.json and day.json, not from memory.

import manifest from "../generated/day.json";
import { int, ms, pct } from "../format";
import { method, report } from "../report";

const SRC = "https://github.com/InvokFung/invokfung.github.io/tree/main/dispatch-src";
const file = (path: string) => `${SRC}/${path}`;
const D = method("dispatch");
const R = method("repair");
const L = report.latency;
const U = report.undisrupted;
const S = report.solomonSummary;
const B = report.budgets;

const ROWS: { part: string; what: string; decision: string; files: string[] }[] = [
  {
    part: "City",
    what: `A street grid of ${manifest.city.nodes} intersections and ${manifest.city.roads} roads, ${manifest.city.widthKm} by ${manifest.city.heightKm} km, with faster arterials and a river crossed by ${manifest.city.bridges} bridges. Shortest paths between every pair by Dijkstra.`,
    decision: "A river with few bridges is what makes nearest-by-distance wrong: the closest technician can be on the wrong bank. All pairs are computed once, so a travel time during the search is a lookup.",
    files: ["src/core/city.ts", "src/core/graph.ts"],
  },
  {
    part: "Traffic",
    what: "A rush-hour profile over the day, times any traffic you add. Travel times depend on when you leave.",
    decision: "Speeds change in steps (Ichoua, Gendreau and Potvin), so leaving later never gets you there sooner. Arrival and latest departure are both one table lookup per minute of the day, which keeps the search fast without dropping rush hour.",
    files: ["src/core/traffic.ts"],
  },
  {
    part: "The day",
    what: `${report.techsRange[0]}–${report.techsRange[1]} technicians with skills, shifts and a depot; ${report.jobsRange[0]}–${report.jobsRange[1]} jobs with a place, a booked window, a duration, a skill and a priority. All synthetic, from a seed.`,
    decision: "Skills are hard: a gas job never goes to someone without gas. Lateness is soft with a large weight, and overtime is allowed up to an hour past the shift. The objective is ordered: missed jobs, then priority-weighted lateness, then driving, then overtime.",
    files: ["src/core/day.ts", "src/core/model.ts"],
  },
  {
    part: "Routes",
    what: "Each route keeps its arrival, start and departure times, plus two latest-start times per visit: one that adds no lateness after it, one that leaves the return time unchanged.",
    decision: "With those, whether an insertion makes anyone later is answered in O(1), exactly, even under rush hour. Only when it does is the rest of the route re-timed to price the lateness.",
    files: ["src/core/route.ts"],
  },
  {
    part: "Solver",
    what: "Regret-3 construction, then adaptive large neighbourhood search: four ways to remove jobs (random, worst, related, a whole route), three ways to put them back (greedy, regret-2, regret-3), simulated-annealing acceptance and weights that follow what works.",
    decision: `It is anytime: stop it at ${B.replanDeadlineMs} ms and it hands back the best plan so far. The morning plan runs a fixed ${int(B.morningIterations)} iterations instead, so it is the same plan on every machine.`,
    files: ["src/core/solver.ts"],
  },
  {
    part: "Re-planning",
    what: "Events: a technician goes home, an urgent job comes in, a job overruns, traffic changes. Each one freezes what is done or under way and re-plans the rest, starting from the current plan.",
    decision: `A technician who has set off is never turned around, so a customer told someone is on the way keeps their visit. Moving a job to another technician costs as much as five minutes of driving, so the day is not reshuffled to save one. Repair runs first (${ms(L.repairP95)} at p95), so there is always a complete plan; the search uses what is left of the budget.`,
    files: ["src/core/sim.ts"],
  },
  {
    part: "Baselines",
    what: "A greedy dispatcher (the nearest free qualified technician takes the next job) and the morning plan kept as it was, with the leftover jobs pushed to whoever finishes first.",
    decision: "Both are what a dispatch desk does without a solver. They replay the exact same events, scored by the same function.",
    files: ["src/core/greedy.ts", "src/core/metrics.ts", "src/core/scenario.ts"],
  },
];

export default function Architecture() {
  return (
    <>
      <div className="scroll-x" tabIndex={0} role="region" aria-label="How Dispatch is built">
        <table className="arch">
          <thead>
            <tr>
              <th>Part</th>
              <th>What it does</th>
              <th>Decision and trade-off</th>
              <th>Code</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.part}>
                <th>{r.part}</th>
                <td data-label="What it does">{r.what}</td>
                <td data-label="Decision and trade-off">{r.decision}</td>
                <td className="files" data-label="Code">
                  {r.files.map((f) => (
                    <a key={f} href={file(f)} className="mono">
                      {f.replace("src/core/", "")}
                    </a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="why-grid">
        <article className="card">
          <h3>Why ALNS</h3>
          <p>
            A day like this is a vehicle routing problem with time windows, skills and travel times that change by the hour. I wanted a method that copes with all three and can be stopped at {B.replanDeadlineMs} ms with a usable plan. Large neighbourhood search does both: it removes a handful of jobs, puts them back better, and keeps the best plan it has seen.
          </p>
          <p>
            On days with no disruptions the search cuts driving by {pct(U.driveCut)} against the construction it starts from ({int(U.alns.driveMinPerDay)} vs {int(U.construct.driveMinPerDay)} min a day).
            {S ? ` On ${S.instances} Solomon benchmark instances it lands ${(S.meanGap * 100).toFixed(2)}% from the best-known distance on average.` : ""}
          </p>
        </article>
        <article className="card">
          <h3>Why the O(1) check</h3>
          <p>
            Every iteration tries each removed job at every position in every route. Re-simulating the rest of a route to see who is late would make each try cost as much as the route is long. Keeping, for every visit, the latest it could start without making anyone after it late turns that into one comparison.
          </p>
          <p>
            That is what fits a median of {int(L.iterationsP50)} iterations into a re-plan. A test checks the O(1) answer against a brute-force re-simulation on more than a thousand random insertions, with rush hour on.
          </p>
        </article>
        <article className="card">
          <h3>Why freeze, then warm start</h3>
          <p>
            Re-planning from scratch would reshuffle the whole day and tell customers new times for no reason. Dispatch only touches what has not started: a median of {L.jobsInPlayP50} jobs per re-plan. After a sick call a median of {L.movedP50} jobs change technician, the absent one&rsquo;s included.
          </p>
          <p>
            Starting from the current plan means the first answer is already good. The &ldquo;repair only&rdquo; row shows what the search adds on top: {pct(R.onTimeRate)} → {pct(D.onTimeRate)} on time, and weighted lateness {R.weightedLatePerDay.toFixed(1)} → {D.weightedLatePerDay.toFixed(1)} min a day.
          </p>
        </article>
      </div>

      <div className="limits card">
        <h3>Limits, plainly</h3>
        <ul>
          <li>The city, the technicians and the jobs are synthetic, from seeds. A real city has one-way streets, parking and roadworks; real job durations scatter more than these do.</li>
          <li>Travel and job times are treated as known once an event says so. A real dispatcher would plan with buffers for the next surprise; this one only reacts.</li>
          <li>
            Sick calls are the hardest re-plan: a median of {ms(L.sickP50)} against the {B.replanDeadlineMs} ms budget, so most of them stop at the deadline ({L.hitDeadline} of all {int(L.count)} re-plans did). On a slower machine they get fewer iterations. The plan stays complete, because repair runs first, but it can be worse.
          </li>
          <li>Under rush hour the O(1) check is exact for lateness and the overtime cap, while the change in driving and overtime it reports is an estimate. Each accepted plan is re-timed exactly, so the numbers reported are exact.</li>
          <li>
            The generator never makes a day smaller than 60 jobs{report.daysAtJobFloor ? `, so ${report.daysAtJobFloor} of the ${report.days} days sat at that floor and the smallest teams are the busiest` : ""}. Breaks, parts, van stock and jobs that span days are not modelled.
          </li>
        </ul>
      </div>
    </>
  );
}
