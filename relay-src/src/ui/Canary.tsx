// Eval-gated canary rollout on the live traffic: pick a candidate config, watch
// it run the eval suite, take 5% → 25% → 100% of requests, and get promoted or
// rolled back by the gates.

import { CONFIGS, EVAL_TASKS, wilson, type CanaryState } from "@relay/core";
import { DEMO_STEPS, type LiveEngine } from "../live/engine";
import { fmtPct } from "../data";

const EXPECT: Record<string, string> = {
  v2: "expect: promoted",
  v3: "expect: rolled back by the eval gate",
  v4: "expect: passes evals, rolled back on live errors",
};

const pctOf = (w: number) => `${Math.round(w * 100)}%`;

function stepState(s: CanaryState, i: number): "idle" | "active" | "pass" | "fail" {
  const r = s.results.find((x) => x.step === i);
  if (r) return r.ok ? "pass" : "fail";
  if ((s.status === "observing" || s.status === "evaluating") && s.step === i) return "active";
  return "idle";
}

function Banner({ s, now }: { s: CanaryState; now: number }) {
  const cand = CONFIGS.find((c) => c.version === s.candidate);
  switch (s.status) {
    case "idle":
      return (
        <div className="banner">
          <b>Stable: {s.stable}</b>
          Pick a candidate. It runs the eval suite against the simulator first, then takes a growing share of the live traffic above.
        </div>
      );
    case "evaluating":
      return (
        <div className="banner">
          <b>Running the eval suite under {cand?.label ?? s.candidate}</b>
          {EVAL_TASKS.length} labelled tasks through a full gateway on a zero-latency simulator, before {pctOf(DEMO_STEPS[s.step]?.weight ?? 0)} of traffic is at stake.
        </div>
      );
    case "observing": {
      const step = DEMO_STEPS[s.step];
      return (
        <div className="banner">
          <b>
            {s.candidate} is serving {pctOf(s.weight)} of requests
          </b>
          {s.live.canaryN}/{step.minSamples} upstream-served canary requests, {((now - s.stepStartedAt) / 1000).toFixed(1)} s into the step (at least {(step.minDwellMs / 1000).toFixed(1)} s).
        </div>
      );
    }
    case "promoted":
      return (
        <div className="banner ok">
          <b>{s.stable} promoted</b>
          Every gate passed at every step. It now serves all traffic as the stable config.
        </div>
      );
    case "rolled-back":
      return (
        <div className="banner bad">
          <b>Rolled back to {s.stable}</b>
          {s.reason}
        </div>
      );
  }
}

export function Canary({ engine }: { engine: LiveEngine }) {
  const s = engine.canaryState();
  const active = s.status === "evaluating" || s.status === "observing";
  const now = engine.gw.clock.now();
  const w = s.live;
  const stableRate = w.stableN ? w.stableErrors / w.stableN : 0;
  const lo = wilson(w.canaryErrors, w.canaryN).lo;
  const lastEval = s.evals[s.evals.length - 1];
  const lastResult = s.results[s.results.length - 1];
  const g = engine.canary.gates;

  return (
    <div className="canary">
      <div className="panel canary-pick">
        <h2 className="panel-title">
          Candidates <span className="hint">stable is {s.stable}</span>
        </h2>
        {CONFIGS.filter((c) => c.version !== "v1").map((c) => (
          <button key={c.version} type="button" className="btn cand" disabled={active || s.stable === c.version} onClick={() => void engine.canary.begin(c.version).catch(() => {})}>
            <b>Roll out {c.label}</b>
            <span>{c.note}</span>
            <span className="expect">{EXPECT[c.version] ?? ""}</span>
          </button>
        ))}
        <button type="button" className="btn small" onClick={() => engine.resetStable()} disabled={s.stable === "v1" && !active && s.status === "idle"}>
          {active ? "Abort and reset to v1" : "Reset to v1"}
        </button>
        {!engine.knobs.running || engine.knobs.rps < 3 ? <p className="keynote">The live gates need traffic: with load near zero a step times out and rolls back, because no evidence is not a pass.</p> : null}
      </div>
      <div className="panel canary-main">
        <Banner s={s} now={now} />
        <div className="steps" aria-label="Rollout steps">
          {DEMO_STEPS.map((st, i) => (
            <Step key={i} label={pctOf(st.weight)} sub={`≥ ${st.minSamples} req`} state={stepState(s, i)} lineState={stepState(s, i) === "pass" ? "pass" : "idle"} />
          ))}
          <div className="step" data-s={s.status === "promoted" ? "pass" : s.status === "rolled-back" ? "fail" : "idle"}>
            {s.status === "promoted" ? "✓" : s.status === "rolled-back" ? "↩" : "·"}
            <small>{s.status === "rolled-back" ? "rolled back" : "stable"}</small>
          </div>
        </div>
        <div className="split-bar" aria-hidden="true">
          <span className="c" style={{ width: `${s.status === "observing" ? s.weight * 100 : 0}%` }} />
          <span className="s" style={{ width: `${s.status === "observing" ? 100 - s.weight * 100 : 100}%` }} />
        </div>
        <p className="keynote" style={{ marginTop: 0, marginBottom: 12 }}>
          Requests are assigned by a hash of their id, so a retry stays on the same side. Gates: evals ≥ {Math.round(g.minEvalPassRate * 100)}% before each step; the 95% lower bound of the canary's error rate ≤ stable +{" "}
          {Math.round(g.maxErrorIncrease * 100)} points; the 95% lower bound of its p95 ≤ {g.maxP95Ratio}× stable's p95. Cache hits are not counted: they do not exercise the config.
        </p>
        <div className="tbl-wrap">
          <table className="gates">
            <thead>
              <tr>
                <th>Gate</th>
                <th>Value</th>
                <th>Limit</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {s.status === "observing" ? (
                <tr>
                  <td>Live errors (now)</td>
                  <td>
                    {w.canaryErrors}/{w.canaryN} canary (lower bound {fmtPct(lo)}) vs {fmtPct(stableRate)} stable
                  </td>
                  <td>≤ {fmtPct(stableRate + g.maxErrorIncrease)}</td>
                  <td className={lo <= stableRate + g.maxErrorIncrease ? "tone-ok" : "tone-bad"}>{w.canaryN < 5 ? "collecting" : lo <= stableRate + g.maxErrorIncrease ? "ok" : "failing"}</td>
                </tr>
              ) : null}
              {lastResult
                ? lastResult.checks.map((c, i) => (
                    <tr key={i}>
                      <td>
                        {c.gate} at {pctOf(lastResult.weight)}
                      </td>
                      <td>{c.value}</td>
                      <td>{c.limit}</td>
                      <td className={c.ok ? "tone-ok" : "tone-bad"}>{c.ok ? "pass" : "fail"}</td>
                    </tr>
                  ))
                : null}
              {!lastResult && s.status !== "observing" ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No gate has been checked yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {lastEval ? (
          <>
            <h4 style={{ margin: "14px 0 0", fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
              Eval suite under {lastEval.version}: {lastEval.passed}/{lastEval.total} passed
            </h4>
            <div className="evals">
              {lastEval.tasks.map((t) => (
                <span key={t.id} className={`chip ${t.pass ? "ok" : "bad"}`} title={`${t.category}: ${t.detail}`}>
                  {t.pass ? "✓" : "✗"} {t.title}
                </span>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Step({ label, sub, state, lineState }: { label: string; sub: string; state: string; lineState: string }) {
  return (
    <>
      <div className="step" data-s={state}>
        {label}
        <small>{sub}</small>
      </div>
      <div className="step-line" data-s={lineState} />
    </>
  );
}
