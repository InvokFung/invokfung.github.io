import { memo, useEffect, useRef, useState } from "react";
import type { BatchAnalysis } from "../core/analyze";
import { layout, samplePath } from "../core/layout";
import type { Engine } from "./useEngine";
import { compact, fmt, ms, msNum, pct, shortId } from "./format";
import { C, HEALTH, serviceColor } from "./theme";
import { useWidth } from "./Timeline";
import Waterfall from "./Waterfall";

const MAX_BYTES = 60e6;

interface Props {
  upload: Engine["upload"];
  sample: Engine["sample"];
  send: Engine["send"];
  ready: boolean;
}

export default memo(function Upload({ upload, sample, send, ready }: Props) {
  const [drag, setDrag] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const wantDownload = useRef(false);

  useEffect(() => {
    if (!sample || !wantDownload.current) return;
    wantDownload.current = false;
    const url = URL.createObjectURL(new Blob([sample.text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tracewise-otlp-${sample.traces}-traces.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [sample]);

  useEffect(() => setSelected(upload.result?.first?.traceId ?? null), [upload.result]);

  const read = (f: File | undefined) => {
    setLocalError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setLocalError(`That file is ${(f.size / 1e6).toFixed(0)} MB; the limit here is ${MAX_BYTES / 1e6} MB.`);
      return;
    }
    f.text().then(
      (text) => send({ type: "upload", text, name: f.name }),
      (e: Error) => setLocalError(e.message),
    );
  };

  const res = upload.result;
  const a = res?.analysis;
  const err = localError ?? upload.error;

  return (
    <section className="section upload" id="otlp">
      <div className="section-head">
        <p className="eyebrow">Real data</p>
        <h2>Drop in your own traces</h2>
        <p className="lede">
          Export an OTLP/JSON <code>ExportTraceServiceRequest</code> from an OpenTelemetry Collector (the file exporter) or any SDK and drop it here. The same span-tree, exclusive-time and
          sketch code builds its service map, RED metrics and waterfalls. The file is parsed in a worker in this tab and never leaves your machine.
        </p>
      </div>
      <div className="upload-row">
        <label
          className={`drop ${drag ? "drag" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            read(e.dataTransfer.files[0]);
          }}
        >
          <input type="file" accept=".json,application/json" onChange={(e) => read(e.target.files?.[0])} />
          <span className="drop-title">{upload.busy ? "Parsing…" : "Choose or drop an OTLP/JSON file"}</span>
          <span className="small muted">hex or base64 ids, enum names or numbers, scopeSpans or instrumentationLibrarySpans</span>
        </label>
        <div className="upload-actions">
          <button className="primary" disabled={!ready || upload.busy} onClick={() => send({ type: "sample", analyse: true })}>
            Analyse an export of the live system
          </button>
          <button
            disabled={!ready}
            onClick={() => {
              wantDownload.current = true;
              send({ type: "sample", analyse: false });
            }}
          >
            Download it as a file
          </button>
          <span className="small muted">The latest 60 kept traces, written as OTLP/JSON with real timestamps.</span>
        </div>
      </div>
      {err && <p className="upload-error" role="alert">Could not read that file: {err}</p>}
      {res && a && (
        <div className="upload-result">
          <p className="mono small upload-summary">
            <b>{res.name}</b> · {fmt(a.spans)} spans · {fmt(a.traces.length)}
            {a.traces.length >= 200 ? "+" : ""} traces · {a.services.length} services · {ms(a.spanMs)} of activity
            {res.warnings.length > 0 && <span className="muted"> · {res.warnings.length} warning(s): {res.warnings[0]}</span>}
          </p>
          <div className="upload-grid">
            <div className="card">
              <div className="card-head">
                <h3>Service map</h3>
                <span className="small muted">dashed: seen only through client spans</span>
              </div>
              <UploadMap a={a} />
            </div>
            <div className="card">
              <div className="card-head">
                <h3>RED metrics</h3>
              </div>
              <div className="table-scroll">
                <table className="red">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th className="r">Req/s</th>
                      <th className="r">Errors</th>
                      <th className="r">p50 <span className="unit">ms</span></th>
                      <th className="r">p95 <span className="unit">ms</span></th>
                      <th className="r">p99 <span className="unit">ms</span></th>
                      <th className="r">Self <span className="unit">ms</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.services.map((s) => (
                      <tr key={s.node}>
                        <td>
                          <i className="svc-dot" style={{ background: serviceColor(s.node) }} />
                          {s.node}
                          {s.inferred && <span className="tag">inferred</span>}
                        </td>
                        <td className="r mono">{s.rps >= 10 ? Math.round(s.rps) : s.rps.toFixed(2)}</td>
                        <td className={`r mono ${s.err / s.n >= 0.01 ? "bad" : ""}`}>{pct(s.err / Math.max(1, s.n))}</td>
                        <td className="r mono">{msNum(s.p50)}</td>
                        <td className="r mono">{msNum(s.p95)}</td>
                        <td className="r mono">{msNum(s.p99)}</td>
                        <td className="r mono">{msNum(s.selfMean)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small muted">Requests per second over the file's time span; percentiles from a DDSketch with 1% relative error; self time excludes time spent waiting on children.</p>
            </div>
          </div>
          <div className="card traces">
            <div className="card-head">
              <h3>Traces</h3>
              <span className="small muted">errors first, then slowest</span>
            </div>
            <div className="traces-body">
              <div className="trace-list">
                <ul>
                  {a.traces.slice(0, 40).map((t) => (
                    <li key={t.traceId}>
                      <button
                        className={t.traceId === selected ? "on" : ""}
                        onClick={() => {
                          setSelected(t.traceId);
                          send({ type: "trace", traceId: t.traceId, source: "upload" });
                        }}
                      >
                        <span className={`reason ${t.error ? "r-error" : "r-sampled"}`}>{t.error ? "error" : "ok"}</span>
                        <span className="t-flow">{t.root}</span>
                        <span className="t-dur mono">{ms(t.durMs)}</span>
                        <span className="t-time mono muted">{shortId(t.traceId)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="trace-view">
                <Waterfall wf={upload.waterfall && upload.waterfall.traceId === selected ? upload.waterfall : null} />
              </div>
            </div>
          </div>
          <p className="small muted">
            Parsed {compact(a.spans)} spans in this tab. Times are shown from {new Date(res.epochMs).toISOString().replace("T", " ").slice(0, 19)} UTC.
          </p>
        </div>
      )}
    </section>
  );
});

function UploadMap({ a }: { a: BatchAnalysis }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const W = Math.max(260, width);
  const vertical = W < 520;
  const H = vertical ? 520 : 340;
  const nodes = a.services.map((s) => s.node);
  const L = width ? layout({ nodes, edges: a.edges.filter((e) => e.from !== e.to) }, { width: W, height: H, vertical, pad: 48 }) : null;
  const maxN = Math.max(1, ...a.services.map((s) => s.n));
  return (
    <div ref={ref} className="umap">
      {L && (
        <svg width={W} height={H} role="img" aria-label={`Service map of the uploaded traces: ${nodes.length} services and ${a.edges.length} call edges.`}>
          {L.edges.map((e) => {
            const p = samplePath(e.points, vertical, 16);
            let d = `M${p.xs[0]},${p.ys[0]}`;
            for (let i = 1; i < p.xs.length; i++) d += `L${p.xs[i].toFixed(1)},${p.ys[i].toFixed(1)}`;
            const ed = a.edges.find((x) => x.from === e.from && x.to === e.to);
            const bad = ed && ed.err / Math.max(1, ed.n) >= 0.02;
            return (
              <path key={`${e.from}>${e.to}`} d={d} fill="none" stroke={bad ? C.bad : "rgba(150,170,160,0.35)"} strokeWidth={1.4}>
                <title>{`${e.from} → ${e.to}: ${ed?.n ?? 0} calls, p95 ${ms(ed?.p95 ?? 0)}`}</title>
              </path>
            );
          })}
          {a.services.map((s) => {
            const p = L.nodes.get(s.node);
            if (!p) return null;
            const r = 10 + 12 * Math.sqrt(s.n / maxN);
            const er = s.ownErr / Math.max(1, s.n);
            const h = er >= 0.05 ? 2 : er >= 0.01 ? 1 : 0;
            return (
              <g key={s.node}>
                <circle cx={p.x} cy={p.y} r={r} fill={C.panel2} stroke={h ? HEALTH[h] : "#3d4a50"} strokeWidth={h ? 2 : 1.5} strokeDasharray={s.inferred ? "3 3" : undefined} />
                <circle cx={p.x} cy={p.y} r={3.5} fill={serviceColor(s.node)} />
                <text x={p.x} y={p.y + r + 14} textAnchor="middle" className="umap-label">
                  {s.node}
                </text>
                <title>{`${s.node}: ${s.n} requests, ${pct(s.err / Math.max(1, s.n))} failing, p95 ${ms(s.p95)}`}</title>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
