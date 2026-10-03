import { useMemo, useState } from "react";
import type { Waterfall as W } from "../core/analyze";
import type { Snapshot, TraceSummary } from "../worker/protocol";
import { clock, compact, ms, pct } from "./format";
import { FLOW_LABEL } from "./theme";
import Waterfall from "./Waterfall";

interface Props {
  traces: TraceSummary[];
  selected: string | null;
  exemplar: string | null;
  waterfall: { traceId: string; waterfall: W | null } | null;
  onSelect: (id: string) => void;
  startHour: number;
  snap: Snapshot | null;
}

const FILTERS = [
  ["all", "All kept"],
  ["error", "Errors"],
  ["slow", "Slow"],
  ["sampled", "Sampled"],
] as const;

export default function Traces({ traces, selected, exemplar, waterfall, onSelect, startHour, snap }: Props) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const shown = traces.filter((t) => filter === "all" || t.reason === filter).slice(0, 40);
  const sel = traces.find((t) => t.traceId === selected);
  const tot = snap?.totals;
  const wf = waterfall && waterfall.traceId === selected ? waterfall.waterfall : null;
  const isExemplar = selected !== null && selected === exemplar;
  const view = useMemo(
    () => (
      <Waterfall
        wf={wf}
        title={
          sel || isExemplar ? (
            <span className="wf-title">
              {sel && (
                <>
                  <span className={`reason r-${sel.reason}`}>{sel.reason}</span> {FLOW_LABEL[sel.flow] ?? sel.flow}
                </>
              )}
              {isExemplar && <span className="tag good">exemplar for the top suspect</span>}
            </span>
          ) : null
        }
      />
    ),
    [wf, sel?.reason, sel?.flow, isExemplar],
  );

  return (
    <div className="traces card">
      <div className="card-head">
        <h3>Kept traces</h3>
        {tot && (
          <span className="small muted mono">
            {compact(tot.kept)} of {compact(tot.seen)} kept ({pct(tot.kept / Math.max(1, tot.seen))}) · error traces {compact(tot.errorKept)}/{compact(tot.errorTraces)}
          </span>
        )}
      </div>
      <div className="traces-body">
        <div className="trace-list">
          <div className="chips" role="group" aria-label="Filter kept traces">
            {FILTERS.map(([k, name]) => (
              <button key={k} className={filter === k ? "on" : ""} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {name}
              </button>
            ))}
          </div>
          <ul>
            {shown.map((t) => (
              <li key={t.traceId}>
                <button className={t.traceId === selected ? "on" : ""} onClick={() => onSelect(t.traceId)}>
                  <span className={`reason r-${t.reason}`}>{t.reason}</span>
                  <span className="t-flow">
                    {FLOW_LABEL[t.flow] ?? t.flow}
                    {t.traceId === exemplar && <span className="tag good">exemplar</span>}
                  </span>
                  <span className="t-dur mono">{ms(t.durMs)}</span>
                  <span className="t-time mono muted">{clock(t.startMs, startHour, true)}</span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="muted small pad">None in the latest kept traces.</li>}
          </ul>
        </div>
        <div className="trace-view">
          {view}
        </div>
      </div>
    </div>
  );
}
