import type { Snapshot, ToWorker } from "../worker/protocol";
import { clock, compact, pct } from "./format";
import { FLOW_LABEL } from "./theme";

const SPEEDS = [
  [0, "Pause"],
  [15, "15×"],
  [60, "60×"],
  [240, "240×"],
] as const;

export default function StatusStrip({ snap, startHour, warm, send }: { snap: Snapshot | null; startHour: number; warm: { done: number; total: number } | null; send: (m: ToWorker) => void }) {
  const warming = !snap;
  const alerts = snap?.alerts ?? [];
  const t = snap?.totals;
  const flows = [...new Set(alerts.map((a) => a.flow))];
  return (
    <div className="status" aria-label="Simulation status">
      <div className="clock">
        <span className={`live-dot ${snap && snap.speed > 0 ? "on" : ""}`} aria-hidden />
        <span className="mono big">{snap ? clock(snap.simMs, startHour, true) : "--:--:--"}</span>
        <span className="small muted">simulated time</span>
      </div>
      <div className="speeds" role="group" aria-label="Simulation speed">
        {SPEEDS.map(([v, name]) => (
          <button key={v} disabled={warming} className={snap?.speed === v ? "on" : ""} aria-pressed={snap?.speed === v} onClick={() => send({ type: "speed", speed: v })}>
            {name}
          </button>
        ))}
      </div>
      {warming ? (
        <div className="warm">
          <div className="bar">
            <div style={{ width: `${warm ? (warm.done / warm.total) * 100 : 0}%` }} />
          </div>
          <span className="small muted">warming up: {warm ? Math.round(warm.done / 60_000) : 0} of {warm ? warm.total / 60_000 : 36} simulated minutes</span>
        </div>
      ) : (
        <dl className="stats">
          <div>
            <dt>traffic</dt>
            <dd className="mono">{snap!.rate.toFixed(1)} req/s</dd>
          </div>
          <div>
            <dt>spans in</dt>
            <dd className="mono">{compact(t!.spans)}</dd>
          </div>
          <div>
            <dt>traces kept</dt>
            <dd className="mono">{pct(t!.kept / Math.max(1, t!.seen))}</dd>
          </div>
          <div>
            <dt>error traces kept</dt>
            <dd className="mono">{t!.errorTraces ? pct(t!.errorKept / t!.errorTraces, 0) : "–"}</dd>
          </div>
        </dl>
      )}
      <div className={`slo ${alerts.length ? "bad" : "ok"}`} role="status">
        {warming ? "Detectors warming up" : alerts.length ? `Alerting · ${flows.length === 1 ? (FLOW_LABEL[flows[0]] ?? flows[0]) : `${flows.length} flows`}` : "All SLOs healthy"}
      </div>
    </div>
  );
}
