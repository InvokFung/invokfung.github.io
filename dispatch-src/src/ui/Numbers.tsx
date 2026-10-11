// The measured numbers, straight from src/generated/eval.json (written by
// `npm run eval`), plus the morning plan recomputed live in this browser.

import { useClient } from "../client";
import { int, ms, pct } from "../format";
import { method, report } from "../report";

const D = method("dispatch");
const R = method("repair");
const K = method("keep");
const G = method("greedy");
const L = report.latency;
const U = report.undisrupted;
const S = report.solomonSummary;
const gapPct = (g: number) => `${(Math.abs(g) < 5e-5 ? 0 : g * 100).toFixed(2)}%`;

function OnTimeBars() {
  const lo = 0.5;
  const x = (v: number) => `${Math.max(0, (v - lo) / (1 - lo)) * 100}%`;
  return (
    <div className="ladder" role="table" aria-label="Visits on time and jobs completed by method">
      <div className="ladder-head" role="row">
        <span role="columnheader">Method</span>
        <span role="columnheader">
          On time <i className="key pw" /> and completed <i className="key b3" /> <span className="muted">(axis from 50%)</span>
        </span>
      </div>
      {report.methods.map((m) => (
        <div key={m.key} className={`ladder-row ${m.key === "dispatch" ? "is-main" : ""}`} role="row">
          <span className="ladder-label" role="cell">
            {m.label}
          </span>
          <span className="ladder-bars" role="cell">
            <span className="lb pw" style={{ width: x(m.onTimeRate) }}>
              <b className="mono">{pct(m.onTimeRate)}</b>
            </span>
            <span className="lb b3" style={{ width: x(m.completedRate) }}>
              <b className="mono">{pct(m.completedRate)}</b>
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function LiveCheck() {
  const st = useClient();
  const m = st.init?.morning;
  if (!m) return null;
  const want = report.demo.undisrupted.alns;
  const same = Math.abs(m.outcome.driveMin - want.driveMin) < 0.05 && m.outcome.onTime === want.onTime && m.outcome.served === want.served;
  return (
    <p className="live-check">
      <span className="label">Recomputed in this browser</span> the morning plan for &ldquo;{report.demo.seed}&rdquo;, {int(m.iterations)} ALNS iterations in <b className="mono">{ms(m.ms)}</b> (Node: {ms(report.demo.morningMs)}). Played with no disruptions it drives <b className="mono">{m.outcome.driveMin.toFixed(1)}</b> min with {m.outcome.onTime} of {m.outcome.jobs} visits on time
      {same ? <span className="ok"> · matches the report</span> : <span className="warn"> · differs from the report ({want.driveMin.toFixed(1)} min)</span>}
    </p>
  );
}

export default function Numbers() {
  const demo = report.demo.disrupted;
  return (
    <>
      <div className="kpis">
        <div className="kpi main">
          <span className="kpi-label">Visits on time, disrupted days</span>
          <span className="kpi-big mono">{pct(D.onTimeRate)}</span>
          <span className="kpi-sub">
            morning plan kept: {pct(K.onTimeRate)} · greedy: {pct(G.onTimeRate)}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Jobs completed</span>
          <span className="kpi-big mono">{pct(D.completedRate)}</span>
          <span className="kpi-sub">
            {int(D.served)} of {int(D.jobs)}; morning plan {pct(K.completedRate)}, greedy {pct(G.completedRate)}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Priority-weighted lateness</span>
          <span className="kpi-big mono">{D.weightedLatePerDay.toFixed(1)}</span>
          <span className="kpi-sub">
            min/day; morning plan {K.weightedLatePerDay.toFixed(1)}, greedy {G.weightedLatePerDay.toFixed(1)}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Urgent jobs started within 2 h</span>
          <span className="kpi-big mono">
            {D.urgentOnTime}
            <span className="dim">/{D.urgent}</span>
          </span>
          <span className="kpi-sub">
            morning plan {K.urgentOnTime}, greedy {G.urgentOnTime}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Re-plan latency, Node {report.node}</span>
          <span className="kpi-big mono">{ms(L.p50)}</span>
          <span className="kpi-sub">
            p50; p95 {ms(L.p95)}, max {ms(L.max)} over {int(L.count)} re-plans; {L.hitDeadline} stopped at the {report.budgets.replanDeadlineMs} ms budget
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Search over construction</span>
          <span className="kpi-big mono">{pct(U.driveCut)}</span>
          <span className="kpi-sub">
            less driving on undisrupted days: {int(U.alns.driveMinPerDay)} vs {int(U.construct.driveMinPerDay)} min/day
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Days with more visits on time</span>
          <span className="kpi-big mono">
            {report.wins.vsKeep}
            <span className="dim">/{report.days}</span>
          </span>
          <span className="kpi-sub">
            than keeping the morning plan ({report.wins.tiesKeep} ties); {report.wins.vsGreedy} than greedy
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Morning plan, {int(report.budgets.morningIterations)} iterations</span>
          <span className="kpi-big mono">{ms(U.morningMsP50)}</span>
          <span className="kpi-sub">median per day, max {ms(U.morningMsMax)}; the same plan on every machine</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Solomon benchmark, gap to best known</span>
          {S ? (
            <>
              <span className="kpi-big mono">{gapPct(S.meanGap)}</span>
              <span className="kpi-sub">
                mean over {S.instances} instances, max {gapPct(S.maxGap)}; {S.atBks} at the best-known cost
              </span>
            </>
          ) : (
            <>
              <span className="kpi-big mono dim">skipped</span>
              <span className="kpi-sub">the instances could not be fetched when the report was built</span>
            </>
          )}
        </div>
      </div>

      <LiveCheck />

      <div className="num-grid">
        <div className="card">
          <h3 className="label">{report.days} disrupted days, four ways</h3>
          <OnTimeBars />
          <div className="scroll-x" tabIndex={0} role="region" aria-label="Results by method">
            <table className="data mini">
              <thead>
                <tr>
                  <th>Method</th>
                  <th className="num">Weighted lateness</th>
                  <th className="num">Drive</th>
                  <th className="num">Overtime</th>
                </tr>
              </thead>
              <tbody>
                {report.methods.map((m) => (
                  <tr key={m.key} className={m.key === "dispatch" ? "is-main" : ""}>
                    <td>{m.label}</td>
                    <td className="num mono strong">{m.weightedLatePerDay.toFixed(1)}</td>
                    <td className="num mono">{int(m.driveMinPerDay)}</td>
                    <td className="num mono">{int(m.overtimeMinPerDay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Minutes per day, averaged over the days. Every method saw the same {report.techsRange[0]}–{report.techsRange[1]} technicians and {report.jobsRange[0]}–{report.jobsRange[1]} jobs a day and the same events: {report.scenario}. &ldquo;Repair only&rdquo; is Dispatch with the search switched off, so the gap between the first two rows is what the 50 ms of search buys: {(R.weightedLatePerDay - D.weightedLatePerDay).toFixed(1)} fewer weighted late minutes a day.
          </p>
        </div>
        <div className="card">
          <h3 className="label">The day on this page, measured in Node</h3>
          <div className="scroll-x" tabIndex={0} role="region" aria-label="The demo day by method">
            <table className="data mini">
              <thead>
                <tr>
                  <th>&ldquo;{report.demo.seed}&rdquo; with the script</th>
                  <th className="num">On time</th>
                  <th className="num">Done</th>
                  <th className="num">Drive</th>
                </tr>
              </thead>
              <tbody>
                {(["dispatch", "repair", "keep", "greedy"] as const).map((k) => (
                  <tr key={k} className={k === "dispatch" ? "is-main" : ""}>
                    <td>{method(k).label}</td>
                    <td className="num mono strong">
                      {demo[k].onTime}/{demo[k].jobs}
                    </td>
                    <td className="num mono">{demo[k].served}</td>
                    <td className="num mono">{int(demo[k].driveMin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Re-plans that day: {report.demo.log.map((l) => `${l.kind} ${ms(l.ms)}`).join(", ")}. In your browser the timings differ, and a re-plan that stops at the deadline can land on a different plan, so the cards above may not match this table exactly.
          </p>
          <h3 className="label">Solomon VRPTW</h3>
          {S ? (
            <div className="scroll-x" tabIndex={0} role="region" aria-label="Solomon instances">
              <table className="data mini">
                <thead>
                  <tr>
                    <th>Instance</th>
                    <th className="num">Distance</th>
                    <th className="num">Best known</th>
                    <th className="num">Gap</th>
                    <th className="num">Vehicles</th>
                  </tr>
                </thead>
                <tbody>
                  {report.solomon.map((s) => (
                    <tr key={s.name}>
                      <td className="mono">{s.name}</td>
                      <td className="num mono">{s.distance.toFixed(1)}</td>
                      <td className="num mono muted">{s.bks.toFixed(1)}</td>
                      <td className={`num mono ${s.gap <= 1e-6 ? "ok" : ""}`}>{gapPct(s.gap)}</td>
                      <td className="num mono">
                        {s.vehicles} <span className="muted">({s.bksVehicles})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small muted">Skipped: the instances were not available when the report was built.</p>
          )}
          {S && (
            <p className="muted small">
              The same solver with hard windows and capacity, {int(S.iterations)} iterations per instance. Distances are truncated to one decimal and the best-known costs are distance only (the DIMACS convention, from PyVRP&rsquo;s instance set), which is what the solver minimises.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
