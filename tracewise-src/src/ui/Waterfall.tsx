import { useState } from "react";
import type { Waterfall as W, WaterfallSpan } from "../core/analyze";
import { KIND_NAME } from "../core/types";
import { ms, pct, shortId } from "./format";
import { label } from "./ServiceMap";
import { serviceColor } from "./theme";

const MAX_ROWS = 120;

export default function Waterfall({ wf, title }: { wf: W | null; title?: React.ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!wf) return <div className="wf-empty muted">Pick a trace to see its waterfall.</div>;
  const total = Math.max(wf.durMs, 1e-6);
  const cpTotal = wf.byNode.reduce((a, b) => a + b.ms, 0);
  const rows = wf.spans.slice(0, MAX_ROWS);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="wf">
      <div className="wf-head">
        {title}
        <span className="mono muted small">
          {shortId(wf.traceId)} · {ms(wf.durMs)} · {wf.spans.length} spans
        </span>
      </div>
      {cpTotal > 0 && (
        <div className="cp">
          <div className="cp-label small">
            <span>Critical path by service</span>
            <span className="muted">the work that set the end-to-end time</span>
          </div>
          <div className="cp-bar" role="img" aria-label={wf.byNode.map((b) => `${label(b.node)} ${pct(b.ms / cpTotal, 0)}`).join(", ")}>
            {wf.byNode.map((b) => (
              <span key={b.node} style={{ width: `${(b.ms / cpTotal) * 100}%`, background: serviceColor(b.node) }} title={`${label(b.node)}: ${ms(b.ms)}`} />
            ))}
          </div>
          <ul className="cp-legend small">
            {wf.byNode.slice(0, 4).map((b) => (
              <li key={b.node}>
                <i style={{ background: serviceColor(b.node) }} />
                {label(b.node)} <span className="mono muted">{ms(b.ms)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="wf-grid" role="table" aria-label="Spans in this trace">
        <div className="wf-row wf-ruler" role="row" aria-hidden>
          <div className="wf-name" />
          <div className="wf-track">
            {ticks.map((t) => (
              <span key={t} style={{ left: `${t * 100}%` }}>
                {ms(total * t)}
              </span>
            ))}
          </div>
        </div>
        {rows.map((s) => (
          <Row key={s.spanId} s={s} total={total} open={open === s.spanId} onToggle={() => setOpen(open === s.spanId ? null : s.spanId)} />
        ))}
        {wf.spans.length > MAX_ROWS && <p className="muted small">{wf.spans.length - MAX_ROWS} more spans not shown.</p>}
      </div>
      <div className="wf-key small muted">
        <span>
          <i className="sw cpk" /> critical path
        </span>
        <span>
          <i className="sw errk" /> failed span
        </span>
        <span>bar colour = service; click a row for its attributes</span>
      </div>
    </div>
  );
}

function Row({ s, total, open, onToggle }: { s: WaterfallSpan; total: number; open: boolean; onToggle: () => void }) {
  const left = (s.startMs / total) * 100;
  const width = Math.max(0.25, (s.durMs / total) * 100);
  const color = serviceColor(s.node);
  return (
    <>
      <div className={`wf-row ${s.error ? "err" : ""} ${open ? "open" : ""}`} role="row">
        <button className="wf-name" style={{ paddingLeft: `${Math.min(s.depth, 10) * 10 + 6}px` }} onClick={onToggle} aria-expanded={open}>
          <i style={{ background: color }} aria-hidden />
          <span className="wf-op">{s.name}</span>
          <span className="wf-svc">{s.node !== s.service ? `${s.service} → ${label(s.node)}` : s.service}</span>
        </button>
        <div className="wf-track" role="cell">
          <span className="wf-bar" style={{ left: `${left}%`, width: `${width}%`, background: s.error ? "var(--bad)" : color }} />
          {s.critical.map(([a, b], i) => (
            <span key={i} className="wf-cp" style={{ left: `${(a / total) * 100}%`, width: `${Math.max(0.2, ((b - a) / total) * 100)}%` }} />
          ))}
          <span className="wf-dur mono" style={left > 70 ? { right: `${100 - left + 0.5}%` } : { left: `calc(${left + width}% + 4px)` }}>
            {ms(s.durMs)}
          </span>
        </div>
      </div>
      {open && (
        <div className="wf-detail" role="row">
          <dl>
            <dt>kind</dt>
            <dd>{KIND_NAME[s.kind as keyof typeof KIND_NAME] ?? s.kind}</dd>
            <dt>start</dt>
            <dd>+{ms(s.startMs)}</dd>
            <dt>duration</dt>
            <dd>{ms(s.durMs)}</dd>
            <dt>self time</dt>
            <dd>{ms(s.selfMs)}</dd>
            <dt>on critical path</dt>
            <dd>{ms(s.criticalMs)}</dd>
            {s.version && (
              <>
                <dt>version</dt>
                <dd>{s.version}</dd>
              </>
            )}
            {s.error && (
              <>
                <dt>status</dt>
                <dd className="bad">ERROR {s.statusMessage ?? ""}</dd>
              </>
            )}
            {Object.entries(s.attributes).map(([k, v]) => (
              <span key={k} className="kv">
                <dt>{k}</dt>
                <dd>{String(v)}</dd>
              </span>
            ))}
          </dl>
        </div>
      )}
    </>
  );
}
