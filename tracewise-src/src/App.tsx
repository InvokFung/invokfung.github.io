import { useCallback, useEffect, useRef, useState } from "react";
import report from "./generated/eval.json";
import { SERVICES } from "./core/topology";
import Architecture from "./ui/Architecture";
import ChaosPanel from "./ui/ChaosPanel";
import { compact, fmt, pct } from "./ui/format";
import Numbers from "./ui/Numbers";
import RcaCard from "./ui/RcaCard";
import ServiceMap from "./ui/ServiceMap";
import StatusStrip from "./ui/StatusStrip";
import Timeline from "./ui/Timeline";
import Traces from "./ui/Traces";
import Upload from "./ui/Upload";
import { useEngine } from "./ui/useEngine";
import type { FaultView } from "./worker/protocol";

const SOURCE = "https://github.com/InvokFung/invokfung.github.io/tree/main/tracewise-src";

export default function App() {
  const engine = useEngine();
  const { snap, send, incidents, traces, startHour } = engine;
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const faultLog = useRef(new Map<number, FaultView>());
  for (const f of snap?.faults ?? []) faultLog.current.set(f.id, f);

  const reveal = useCallback((id: number) => setRevealed((s) => new Set(s).add(id)), []);

  const incident = incidents[incidents.length - 1] ?? null;
  const cause = incident
    ? ([...faultLog.current.values()]
        .filter((f) => f.startMs <= incident.openedAt && (f.endMs === null || f.endMs >= incident.onsetMinute * 60_000 - 60_000))
        .sort((a, b) => b.startMs - a.startMs)[0] ?? null)
    : null;
  const hidden = cause && cause.mystery && !revealed.has(cause.id) ? cause : null;
  const exemplar = incident?.exemplar ?? null;

  const select = useCallback(
    (id: string, manual: boolean) => {
      setSelected(id);
      if (manual) setFollow(false);
      send({ type: "trace", traceId: id, source: "live" });
    },
    [send],
  );

  // Follow the open incident's exemplar trace until the visitor picks one.
  useEffect(() => {
    if (exemplar && follow) select(exemplar, false);
  }, [exemplar, follow, select]);
  useEffect(() => {
    if (!selected && traces.length) select((traces.find((t) => t.reason === "slow") ?? traces[0]).traceId, false);
  }, [traces, selected, select]);
  // A new incident takes the waterfall back to its exemplar.
  const openId = incident && incident.closedAt === undefined ? incident.id : null;
  useEffect(() => {
    if (openId !== null) setFollow(true);
  }, [openId]);

  const m = report.rca.methods as Record<string, { top1: number; top3: number }>;
  const dashboards = [m.highestP99.top1, m.alerting.top1, m.p99Jump.top1];

  return (
    <>
      <header className="topbar">
        <a className="back" href="/" title="Back to the portfolio">
          ← Alan Fung
        </a>
        <nav>
          <a href="#demo">Demo</a>
          <a href="#numbers">Numbers</a>
          <a href="#otlp">Real data</a>
          <a href="#architecture">Architecture</a>
          <a href={SOURCE} target="_blank" rel="noopener">
            Source ↗
          </a>
        </nav>
      </header>

      <main>
        <section className="console" id="demo" aria-label="Live demo">
          <div className="console-head">
            <div className="brand">
              <span className="logo" aria-hidden>
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path d="M3 6h7M6 12h9M9 18h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  <circle cx="10" cy="6" r="2.2" fill="currentColor" />
                  <circle cx="15" cy="12" r="2.2" fill="currentColor" />
                  <circle cx="21" cy="18" r="2.2" fill="currentColor" />
                </svg>
              </span>
              <span className="brand-name">Tracewise</span>
              <span className="badge">simulated system</span>
            </div>
            <p className="small muted console-note">
              A checkout system of {SERVICES.length} services, simulated in your browser at {snap ? `${snap.speed || "paused"}${snap.speed ? "×" : ""}` : "60×"} real time. A scripted incident starts a few minutes in; use the chaos panel to cause your own.
            </p>
          </div>
          {engine.failed && <p className="upload-error">The engine could not start: {engine.failed}</p>}
          <p className="sr-only" aria-live="polite">
            {incident
              ? incident.closedAt === undefined
                ? `Incident ${incident.id} open on ${incident.flow}. Top suspect: ${incident.rca?.ranking[0]?.node ?? "ranking"}.`
                : `Incident ${incident.id} resolved.`
              : ""}
          </p>
          <StatusStrip snap={snap} startHour={startHour} warm={engine.warm} send={send} />
          <div className="console-grid">
            <div className="card map-card">
              <div className="card-head">
                <h3>Service map</h3>
                <span className="small muted map-legend">
                  <span className="lgi">
                    <i className="lg ok" /> healthy
                  </span>
                  <span className="lgi">
                    <i className="lg warn" /> degraded
                  </span>
                  <span className="lgi">
                    <i className="lg bad" /> failing
                  </span>
                  <span className="lgi">
                    <i className="lg sus" /> top suspect
                  </span>
                  <span>· dots are requests, red when they fail</span>
                </span>
              </div>
              <ServiceMap subscribe={engine.subscribe} snap={snap} />
              <p className="small muted map-foot">
                Circle size follows traffic; the inner arc is the worker pool in use. Dashed outlines emit no spans and are seen through their callers. Failed calls are drawn 3× as often so
                small error rates show.
              </p>
            </div>
            <div className="rca-cell">
              <RcaCard incident={incident} fault={hidden ? null : cause} hiddenFault={hidden} startHour={startHour} warming={!snap} onReveal={reveal} latest={engine.points[engine.points.length - 1] ?? null} />
            </div>
            <div className="chaos-cell">
              <ChaosPanel snap={snap} startHour={startHour} send={send} revealed={revealed} onReveal={reveal} />
            </div>
            <div className="wide-cell">
              <Timeline points={engine.points} incidents={incidents} faults={[...faultLog.current.values()]} revealed={revealed} nowMs={snap?.simMs ?? 0} startHour={startHour} />
            </div>
            <div className="wide-cell">
              <Traces traces={traces} selected={selected} exemplar={exemplar} waterfall={engine.waterfall} onSelect={(id) => select(id, true)} startHour={startHour} snap={snap} />
            </div>
          </div>
        </section>

        <section className="section pitch">
          <h1>
            Tracewise follows every request through a distributed system, notices when it breaks, and <span className="hl">ranks the service to blame</span>.
          </h1>
          <p className="lede">
            It is a tracing backend in miniature: span assembly, tail-based sampling, RED metrics, anomaly detection, SLO burn-rate alerts and root-cause ranking, written from scratch in
            TypeScript and checked against {report.config.faultScenarios} seeded incidents.
          </p>
        </section>

        <section className="section demonstrates">
          <div className="section-head">
            <p className="eyebrow">What this demonstrates</p>
          </div>
          <ul className="demo-list">
            <li>
              <h3>Streaming trace assembly</h3>
              <p>Out-of-order spans become trace trees after a watermark and a decision wait; late spans join as fragments. {compact(report.throughput.ingestSpansPerSec)} spans per second on one thread.</p>
            </li>
            <li>
              <h3>Tail-based sampling with a guarantee</h3>
              <p>
                Keeps {pct(report.sampling.clean.retention)} of traces and every error trace, while the metrics still count all traffic.
              </p>
            </li>
            <li>
              <h3>Statistics that hold up</h3>
              <p>
                DDSketch percentiles within {pct(report.sketch.alpha, 0)}; EWMA, MAD and CUSUM detectors with {fmt(report.falseAlarms.alerts)} false alarms in {fmt(report.falseAlarms.simHours)} simulated hours;
                multi-window burn-rate alerts.
              </p>
            </li>
            <li>
              <h3>Root cause from the call graph</h3>
              <p>
                Exclusive time, a personalised PageRank over the dependencies and a critical-path diff: {pct(m.tracewise.top1)} top-1 on held-out faults, where dashboard heuristics manage{" "}
                {pct(Math.min(...dashboards), 0)} to {pct(Math.max(...dashboards), 0)}.
              </p>
            </li>
            <li>
              <h3>Evaluation as part of the build</h3>
              <p>Baselines, ablations and a held-out seed, regenerated by one command. The numbers on this page are read from its output.</p>
            </li>
            <li>
              <h3>A fast page around heavy work</h3>
              <p>Simulation and pipeline run in a Web Worker; the map is Canvas 2D, the charts are SVG, and the layout is a layered graph drawing written for it.</p>
            </li>
          </ul>
        </section>

        <Numbers />
        <Upload upload={engine.upload} sample={engine.sample} send={send} ready={!!snap} />
        <Architecture />

        <section className="section stack">
          <div className="section-head">
            <p className="eyebrow">Stack</p>
            <h2>Small on purpose</h2>
            <p className="lede">
              The only runtime dependencies are React and React DOM. The sketch, detectors, PageRank, graph layout, simulator, OTLP parser and every chart are written for this project and
              covered by tests run with <code>node:test</code>.
            </p>
          </div>
          <ul className="chips-list">
            {["TypeScript (strict)", "React 19", "Vite", "Web Workers", "Canvas 2D", "SVG", "node:test + tsx", "OpenTelemetry data model", "OTLP/JSON"].map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="source-link">
            <a href={SOURCE} target="_blank" rel="noopener">
              Read the source on GitHub ↗
            </a>
          </p>
        </section>
      </main>

      <footer className="foot">
        <span>
          Built by <a href="/">Alan Fung</a>.
        </span>
        <span>
          <a href={SOURCE} target="_blank" rel="noopener">
            Source on GitHub
          </a>
          <span className="muted"> · evaluation run {report.generatedAt.slice(0, 10)}</span>
        </span>
      </footer>
    </>
  );
}
