import { memo, useEffect, useState, useSyncExternalStore } from "react";
import type { Gateway } from "@relay/core";
import { DEMO_STEPS, LiveEngine } from "./live/engine";
import { SOURCE_URL } from "./data";
import { ChainFlow } from "./ui/ChainFlow";
import { Charts } from "./ui/Charts";
import { Controls, Totals } from "./ui/Controls";
import { Feed } from "./ui/Feed";
import { Playground } from "./ui/Playground";
import { Canary } from "./ui/Canary";
import { AuditTab } from "./ui/AuditTab";
import { Numbers } from "./ui/Numbers";
import { Architecture } from "./ui/Architecture";
import { BrandMark } from "./ui/icons";

type Tab = "play" | "canary" | "audit";
const TABS: { id: Tab; label: string }[] = [
  { id: "play", label: "Playground" },
  { id: "canary", label: "Canary rollout" },
  { id: "audit", label: "Audit log" },
];

const DEMONSTRATES: { title: string; body: string }[] = [
  {
    title: "Request-path engineering",
    body: "A typed middleware chain where any stage can answer, reject, rewrite the request or transform the response stream, with each stage's CPU time measured on every request.",
  },
  {
    title: "Failure handling for streams",
    body: "Timeouts, retries with full jitter, fallback across models and regions, circuit breakers and hedged requests, all before the first token, and an honest error after it.",
  },
  {
    title: "Data protection in transit",
    body: "PII replaced before the model sees it and restored in the streamed answer, even when a placeholder is split across chunks. The audit log never holds the originals.",
  },
  {
    title: "Cost control",
    body: "Tokens metered as they stream, per-tenant budgets that cut a stream mid-answer, the cheapest capable model by default, and a cache that matches reworded repeats without serving wrong answers.",
  },
  {
    title: "Safe change",
    body: `Config changes roll out ${DEMO_STEPS.map((s) => `${Math.round(s.weight * 100)}%`).join(" → ")}, gated on an eval suite and on live error rate and latency, and roll back on their own.`,
  },
  {
    title: "Measured claims",
    body: "Every number below comes from a benchmark script, with held-out sets for the detectors and the misses listed, not hidden.",
  },
];

const Static = memo(function Static() {
  return (
    <>
      <Numbers />
      <Architecture />
      <section className="sec" id="stack">
        <p className="eyebrow">Stack</p>
        <h2>Small on purpose</h2>
        <p className="sub">No gateway, rate-limit, circuit-breaker, LLM SDK or charting library: the parts that matter are the code.</p>
        <div className="stack">
          <div className="panel">
            <b>Core</b>
            <span>TypeScript, zero dependencies. Runs in the browser and in Node; time comes from an injected clock, so tests and benchmarks run in virtual time.</span>
          </div>
          <div className="panel">
            <b>Server</b>
            <span>Node http: Anthropic-compatible POST /v1/messages with SSE, Prometheus /metrics, /audit. Bundled with esbuild into one file in a Docker image.</span>
          </div>
          <div className="panel">
            <b>Page</b>
            <span>React 19 and Vite. The chain is DOM plus a Canvas 2D overlay; charts are plain SVG.</span>
          </div>
          <div className="panel">
            <b>Tests and benchmarks</b>
            <span>node:test through tsx, including end-to-end HTTP tests of the server. npm run bench writes the JSON this page reads.</span>
          </div>
        </div>
        <div className="panel source">
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            Source on GitHub →
          </a>
          <code>relay-src/ · packages/core · apps/server · bench · test</code>
        </div>
      </section>
    </>
  );
});

export default function App() {
  const [engine] = useState(() => new LiveEngine());
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __relay: LiveEngine }).__relay = engine;
  }, [engine]);
  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);
  useSyncExternalStore(engine.subscribe, () => engine.version);
  const [tab, setTab] = useState<Tab>("play");
  const [external, setExternal] = useState<Gateway | null>(null);

  const cs = engine.canaryState();
  const running = engine.knobs.running && engine.knobs.rps > 0;
  const last = engine.series[engine.series.length - 1];

  return (
    <>
      <header className="topbar">
        <a className="back" href="/">
          ← Alan Fung
        </a>
        <nav aria-label="Sections">
          <a href="#demo">Demo</a>
          <a href="#numbers">Numbers</a>
          <a href="#architecture" className="opt">
            Architecture
          </a>
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            Source
          </a>
        </nav>
      </header>
      <main>
        <section id="demo" aria-label="Live demo">
          <div className="demo-head">
            <div className="brand">
              <BrandMark />
              <div>
                <h1>Relay</h1>
                <p>An LLM gateway, running live in this tab against a simulated upstream.</p>
              </div>
            </div>
            <div className="status-pills">
              <span className="pill">
                <span className={`dot ${running ? "live" : "paused"}`} />
                {running ? (
                  <>
                    <b>{last ? last.rps.toFixed(1) : "0.0"}</b> req/s
                  </>
                ) : (
                  "paused"
                )}
              </span>
              <span className="pill">
                stable <b>{cs.stable}</b>
                {cs.status === "observing" && cs.candidate ? (
                  <>
                    {" "}
                    · canary <b>{cs.candidate}</b> {Math.round(cs.weight * 100)}%
                  </>
                ) : null}
              </span>
              <span className="pill">
                upstream <b>simulator</b>
                {external ? " + Claude" : ""}
              </span>
            </div>
          </div>

          <ChainFlow engine={engine} external={external} />

          <div className="live-grid">
            <div style={{ minWidth: 0 }}>
              <Charts series={engine.series} />
              <div style={{ marginTop: 14 }}>
                <Feed recent={engine.recent} />
              </div>
            </div>
            <div style={{ display: "grid", gap: 14, alignContent: "start", minWidth: 0 }}>
              <Controls engine={engine} />
              <Totals engine={engine} />
            </div>
          </div>

          <div className="tabs" role="tablist" aria-label="Demo panels">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id="panel-play" aria-labelledby="tab-play" hidden={tab !== "play"}>
            <Playground engine={engine} onExternal={setExternal} />
          </div>
          <div role="tabpanel" id="panel-canary" aria-labelledby="tab-canary" hidden={tab !== "canary"}>
            {tab === "canary" ? <Canary engine={engine} /> : null}
          </div>
          <div role="tabpanel" id="panel-audit" aria-labelledby="tab-audit" hidden={tab !== "audit"}>
            {tab === "audit" ? <AuditTab engine={engine} /> : null}
          </div>
        </section>

        <section className="pitch" aria-label="What Relay is">
          <p className="eyebrow">Relay</p>
          <h2>
            A gateway that makes every model call <em>safe, reliable and accountable</em>.
          </h2>
          <p className="lede">
            Relay sits between an application and the Anthropic Messages API. It redacts personal data, screens for prompt injection, answers repeats from cache, picks the cheapest capable model, rides out failing upstreams, meters every
            token against a budget and writes down what it did. The demo above is the real gateway package, in your browser; the same package runs as a Node server with an Anthropic-compatible endpoint.
          </p>
          <ul className="demonstrates">
            {DEMONSTRATES.map((d) => (
              <li className="panel" key={d.title}>
                <b>{d.title}</b>
                <span>{d.body}</span>
              </li>
            ))}
          </ul>
        </section>

        <Static />
      </main>
      <footer className="foot">
        <span>Built by Alan Fung</span>
        <span className="muted">
          <a href="/">invokfung.github.io</a> ·{" "}
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            source
          </a>
        </span>
      </footer>
    </>
  );
}
