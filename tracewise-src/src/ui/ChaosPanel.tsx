import { useState } from "react";
import { FAULT_KINDS, type FaultKind } from "../core/sim";
import { SERVICES, serviceDef } from "../core/topology";
import type { FaultInput, FaultView, Snapshot, ToWorker } from "../worker/protocol";
import { clock, faultLabel } from "./format";
import { label } from "./ServiceMap";

const PRESETS: { name: string; note: string; fault: FaultInput }[] = [
  { name: "Slow database", note: "postgres +30 ms per query", fault: { service: "postgres", kind: "latency", magnitude: 30 } },
  { name: "Card API slowdown", note: "external provider +380 ms", fault: { service: "payment-provider", kind: "latency", magnitude: 380 } },
  { name: "Bad deploy", note: "pricing 4× slower, rolls out in 1 min", fault: { service: "pricing", kind: "deploy", magnitude: 4 } },
  { name: "Inventory errors", note: "12% of calls fail", fault: { service: "inventory", kind: "errors", magnitude: 0.12 } },
  { name: "Lost capacity", note: "payments loses 2 of 3 workers", fault: { service: "payments", kind: "capacity", magnitude: 0.67 } },
  { name: "Cache timeouts", note: "25% of redis calls hang", fault: { service: "redis", kind: "timeout", magnitude: 0.25 } },
];

const RANGE: Record<FaultKind, { min: number; max: number; def: number; log?: boolean; unit: (x: number) => string; title: string }> = {
  latency: { min: 5, max: 800, def: 60, log: true, unit: (x) => `+${Math.round(x)} ms`, title: "Added latency" },
  errors: { min: 0.01, max: 0.5, def: 0.1, unit: (x) => `${Math.round(x * 100)}% fail`, title: "Error rate" },
  capacity: { min: 0.1, max: 0.95, def: 0.6, unit: (x) => `${Math.round(x * 100)}% of workers lost`, title: "Lost capacity" },
  timeout: { min: 0.01, max: 0.5, def: 0.15, unit: (x) => `${Math.round(x * 100)}% hang until timeout`, title: "Dependency timeout" },
  deploy: { min: 1.5, max: 6, def: 3, unit: (x) => `${x.toFixed(1)}× slower, +${((x - 1) * 1.5).toFixed(1)}% errors`, title: "Bad deploy" },
};

const WHEN = [0, 1, 2, 5];

interface Props {
  snap: Snapshot | null;
  startHour: number;
  send: (m: ToWorker) => void;
  revealed: Set<number>;
  onReveal: (id: number) => void;
}

export default function ChaosPanel({ snap, startHour, send, revealed, onReveal }: Props) {
  const [service, setService] = useState("inventory");
  const [kind, setKind] = useState<FaultKind>("latency");
  const [pos, setPos] = useState(0.5);
  const [when, setWhen] = useState(0);
  const r = RANGE[kind];
  const value = r.log ? r.min * Math.pow(r.max / r.min, pos) : r.min + (r.max - r.min) * pos;
  const instrumented = serviceDef(service)?.instrumented ?? true;
  const disabled = !snap;
  const now = snap?.simMs ?? 0;
  const faults = snap?.faults ?? [];

  const pickKind = (k: FaultKind) => {
    setKind(k);
    const rr = RANGE[k];
    setPos(rr.log ? Math.log(rr.def / rr.min) / Math.log(rr.max / rr.min) : (rr.def - rr.min) / (rr.max - rr.min));
  };

  return (
    <div className="chaos card">
      <div className="card-head">
        <h3>Chaos</h3>
        <span className="muted small">break something and watch it get caught</span>
      </div>
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.name} disabled={disabled} onClick={() => send({ type: "inject", fault: { ...p.fault, delayMs: p.fault.kind === "deploy" ? 60_000 : 0 } })}>
            <span>{p.name}</span>
            <small>{p.note}</small>
          </button>
        ))}
        <button className="mystery" disabled={disabled} onClick={() => send({ type: "mystery" })}>
          <span>Mystery fault</span>
          <small>a random fault, hidden until you reveal it</small>
        </button>
      </div>

      <details className="custom">
        <summary>Custom fault</summary>
        <div className="custom-grid">
          <label>
            <span>Service</span>
            <select
              value={service}
              onChange={(e) => {
                setService(e.target.value);
                if (kind === "deploy" && !serviceDef(e.target.value)?.instrumented) pickKind("latency");
              }}
            >
              {SERVICES.map((s) => (
                <option key={s.id} value={s.id}>
                  {label(s.id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Fault</span>
            <select value={kind} onChange={(e) => pickKind(e.target.value as FaultKind)}>
              {FAULT_KINDS.map((k) => (
                <option key={k} value={k} disabled={k === "deploy" && !instrumented}>
                  {RANGE[k].title}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            <span>
              Size <b className="mono">{r.unit(value)}</b>
            </span>
            <input type="range" min={0} max={1} step={0.005} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-valuetext={r.unit(value)} />
          </label>
          <fieldset className="wide when">
            <legend>Starts</legend>
            {WHEN.map((m) => (
              <button key={m} className={when === m ? "on" : ""} aria-pressed={when === m} onClick={() => setWhen(m)}>
                {m === 0 ? "now" : `+${m} min`}
              </button>
            ))}
            {when > 0 && <span className="muted small mono">at {clock(now + when * 60_000, startHour)}</span>}
          </fieldset>
          <button className="primary wide" disabled={disabled} onClick={() => send({ type: "inject", fault: { service, kind, magnitude: value, delayMs: when * 60_000 } })}>
            Inject {RANGE[kind].title.toLowerCase()} into {label(service)}
          </button>
        </div>
      </details>

      <div className="faults">
        <div className="faults-head">
          <span className="label">Active faults</span>
          {faults.some((f) => f.endMs === null || f.endMs > now) && (
            <button className="link" onClick={() => send({ type: "clear" })}>
              Clear all
            </button>
          )}
        </div>
        {faults.length === 0 ? (
          <p className="muted small">None. The system is running clean.</p>
        ) : (
          <ul>
            {faults
              .slice()
              .reverse()
              .map((f) => (
                <FaultRow key={f.id} f={f} now={now} startHour={startHour} revealed={revealed.has(f.id)} onReveal={() => onReveal(f.id)} onClear={() => send({ type: "clear", id: f.id })} />
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FaultRow({ f, now, startHour, revealed, onReveal, onClear }: { f: FaultView; now: number; startHour: number; revealed: boolean; onReveal: () => void; onClear: () => void }) {
  const ended = f.endMs !== null && f.endMs <= now;
  const pending = f.startMs > now;
  const hidden = f.mystery && !revealed;
  const what = hidden ? "Mystery fault" : `${label(f.service)}: ${faultLabel(f.kind, f.magnitude)}${f.version ? ` (v${f.version})` : ""}`;
  const when = pending ? `starts ${clock(f.startMs, startHour)}` : ended ? `ended ${clock(f.endMs!, startHour)}` : f.endMs !== null ? `until ${clock(f.endMs, startHour)}` : `since ${clock(f.startMs, startHour)}`;
  return (
    <li className={ended ? "ended" : pending ? "pending" : "live"}>
      <span className="dot" aria-hidden />
      <span className="what">
        {what}
        {f.scripted && <span className="tag">scripted</span>}
        <small className="mono muted">{when}</small>
      </span>
      {hidden && (
        <button className="link" onClick={onReveal}>
          Reveal
        </button>
      )}
      {!ended && (
        <button className="link" onClick={onClear} aria-label={`Clear ${hidden ? "the mystery fault" : what}`}>
          Clear
        </button>
      )}
    </li>
  );
}
