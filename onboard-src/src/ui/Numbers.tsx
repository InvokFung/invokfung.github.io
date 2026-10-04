// The measured numbers, straight from src/generated/eval.json (written by
// `npm run eval`), plus the same score recomputed live in this browser.

import report from "../generated/eval.json";
import { useClient } from "../client";
import { STAGES } from "../core/pipeline";
import { f3, int, ms, pct } from "../format";

const er = report.er;
const onboard = er.methods.find((m) => m.key === "onboard")!;
const baseline = er.methods.find((m) => m.key === "email-raw")!;
const reviewed = er.methods.find((m) => m.key === "reviewed")!;
const s = report.seedSummary;

function Ladder() {
  const lo = 0.5;
  const x = (v: number) => `${((v - lo) / (1 - lo)) * 100}%`;
  return (
    <div className="ladder" role="table" aria-label="Entity resolution F1 by method">
      <div className="ladder-head" role="row">
        <span role="columnheader">Method</span>
        <span role="columnheader">
          Pairwise F1 <i className="key pw" /> and B-cubed F1 <i className="key b3" /> <span className="muted">(axis from 0.5)</span>
        </span>
      </div>
      {er.methods.map((m) => (
        <div key={m.key} className={`ladder-row ${m.key === "onboard" ? "is-main" : ""}`} role="row">
          <span className="ladder-label" role="cell">
            {m.label}
            <span className="muted small">
              {" "}
              P {pct(m.pairwise.precision)} · R {pct(m.pairwise.recall)}
            </span>
          </span>
          <span className="ladder-bars" role="cell">
            <span className="lb pw" style={{ width: x(m.pairwise.f1) }}>
              <b className="mono">{f3(m.pairwise.f1)}</b>
            </span>
            <span className="lb b3" style={{ width: x(m.bcubed.f1) }}>
              <b className="mono">{f3(m.bcubed.f1)}</b>
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function StageCompare() {
  const st = useClient();
  const node = report.throughput.stages as Record<string, number>;
  const max = Math.max(...STAGES.map((x) => Math.max(node[x.key] ?? 0, st.stages[x.key]?.ms ?? 0)));
  return (
    <div className="stage-compare" role="table" aria-label="Stage timings, Node median versus this browser">
      {STAGES.map((x) => {
        const b = st.stages[x.key]?.ms;
        return (
          <div key={x.key} className="sc-row" role="row">
            <span role="cell">{x.label}</span>
            <span className="sc-bars" role="cell">
              <span className="scb node" style={{ width: `${((node[x.key] ?? 0) / max) * 100}%` }} />
              <span className="scb here" style={{ width: `${((b ?? 0) / max) * 100}%` }} />
            </span>
            <span className="mono small" role="cell">
              {ms(node[x.key] ?? 0)} <span className="muted">/ {b === undefined ? "—" : ms(b)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Numbers() {
  const st = useClient();
  const live = st.overview?.mode === "demo" ? st.overview.score : null;
  const changed = st.overview && (st.overview.totals.decisions > 0 || st.overview.thresholds.match !== er.thresholds.match);
  const pii = report.pii;
  const types = Object.keys(pii.validated.byType) as (keyof typeof pii.validated.byType)[];
  const weakest = types.map((t) => ({ type: t, f1: pii.validated.byType[t].f1 })).sort((a, b) => a.f1 - b.f1)[0];
  return (
    <>
      <div className="kpis">
        <div className="kpi main">
          <span className="kpi-label">Entity resolution, pairwise F1</span>
          <span className="kpi-big mono">{f3(onboard.pairwise.f1)}</span>
          <span className="kpi-sub">
            precision {pct(onboard.pairwise.precision)} · recall {pct(onboard.pairwise.recall)} · B-cubed F1 {f3(onboard.bcubed.f1)}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Naive baseline: exact email as exported</span>
          <span className="kpi-big mono dim">{f3(baseline.pairwise.f1)}</span>
          <span className="kpi-sub">precision {pct(baseline.pairwise.precision)}, recall {pct(baseline.pairwise.recall)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">After the {int(er.review.size)}-pair review queue</span>
          <span className="kpi-big mono">{f3(reviewed.pairwise.f1)}</span>
          <span className="kpi-sub">every queued pair answered correctly; {int(er.review.trueMatches)} were true matches</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Across {report.seeds.length} seeds</span>
          <span className="kpi-big mono">{f3(s.pairwiseF1.mean)}</span>
          <span className="kpi-sub">
            pairwise F1, range {f3(s.pairwiseF1.min)} to {f3(s.pairwiseF1.max)}; baseline {f3(s.baselinePairwiseF1.mean)}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Blocking</span>
          <span className="kpi-big mono">{pct(er.blocking.reductionRatio, 2)}</span>
          <span className="kpi-sub">
            of {int(er.blocking.totalPairs)} pairs never compared; {pct(er.blocking.pairsCompleteness)} of true pairs still found
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Schema mapping</span>
          <span className="kpi-big mono">{pct(report.mapping.accuracy)}</span>
          <span className="kpi-sub">
            {report.mapping.correct} of {report.mapping.total} columns; {pct(s.mapping.mean)} mean over {report.seeds.length} seeds with different headers
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">PII detection</span>
          <span className="kpi-big mono">{pct(pii.validated.overall.precision)}</span>
          <span className="kpi-sub">
            precision, recall {pct(pii.validated.overall.recall)}; regex alone: {pct(pii.regexOnly.overall.precision)} / {pct(pii.regexOnly.overall.recall)}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">HyperLogLog distinct counts</span>
          <span className="kpi-big mono">{pct(report.hll.meanAbsError)}</span>
          <span className="kpi-sub">
            mean error over {report.hll.columns} columns, max {pct(report.hll.maxAbsError)}; standard error {pct(report.hll.standardError, 2)}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Throughput, Node {report.node}</span>
          <span className="kpi-big mono">{int(report.throughput.recordsPerSecond)}</span>
          <span className="kpi-sub">
            records/s; median {ms(report.throughput.medianMs)} over {report.throughput.runs} runs of {int(report.records)} records
          </span>
        </div>
      </div>

      {live && (
        <p className="live-check">
          <span className="label">Recomputed in this browser</span> pairwise F1 <b className="mono">{f3(live.pairwise.f1)}</b>, B-cubed F1 <b className="mono">{f3(live.bcubed.f1)}</b>, mapping {pct(live.mapping)}
          {changed ? <span className="muted"> (after your review decisions or threshold change)</span> : Math.abs(live.pairwise.f1 - onboard.pairwise.f1) < 0.0005 ? <span className="ok"> · matches the report</span> : <span className="warn"> · differs from the report</span>}
        </p>
      )}

      <div className="num-grid">
        <div className="card">
          <h3 className="label">Each step of the matcher, scored against the truth</h3>
          <Ladder />
          <p className="muted small">
            Pairwise scores count every pair of records; B-cubed scores each record by how much of its cluster is right, so one big wrong merge costs less than in pairwise terms. Run on seed &ldquo;{report.seed}&rdquo; with {int(report.records)} records and {int(report.trueEntities)} true customers (including {report.contracts.junkTotal} test and spam rows, all {report.contracts.junkCaught} of which landed in quarantine).
          </p>
        </div>
        <div className="card">
          <h3 className="label">PII by type: with checks / regex only</h3>
          <div className="scroll-x" tabIndex={0} role="region" aria-label="PII detection by type">
            <table className="data mini">
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="num">Planted</th>
                  <th className="num">Precision</th>
                  <th className="num">Recall</th>
                  <th className="num">Regex precision</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => {
                  const v = pii.validated.byType[t];
                  const r = pii.regexOnly.byType[t];
                  return (
                    <tr key={t}>
                      <td>{t}</td>
                      <td className="num mono">{int(v.tp + v.fn)}</td>
                      <td className="num mono strong">{pct(v.precision)}</td>
                      <td className="num mono">{pct(v.recall)}</td>
                      <td className="num mono muted">{pct(r.precision)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            The regex-only column is the same scan with every check switched off: Luhn, IBAN checksums, the birth-date keyword, phone shapes and the identifier context (&ldquo;ref&rdquo;, &ldquo;order #&rdquo;). Weakest type with checks: {weakest.type}, F1 {f3(weakest.f1)}.
          </p>
          <h3 className="label">Stage timings: Node median / this browser</h3>
          <StageCompare />
        </div>
      </div>
    </>
  );
}
