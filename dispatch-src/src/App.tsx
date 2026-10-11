import { useEffect } from "react";
import manifest from "./generated/day.json";
import { client, useClient } from "./client";
import { int, ms, pct } from "./format";
import { method, report } from "./report";
import MapView from "./ui/MapView";
import Timeline from "./ui/Timeline";
import { Controls, Disrupt, ReplanLog, StatusStrip } from "./ui/Console";
import Compare from "./ui/Compare";
import Numbers from "./ui/Numbers";
import Architecture from "./ui/Architecture";

const SOURCE = "https://github.com/InvokFung/invokfung.github.io/tree/main/dispatch-src";
const D = method("dispatch");
const K = method("keep");
const G = method("greedy");

function Status() {
  const st = useClient();
  if (st.phase === "error") return <p className="status bad">The worker stopped: {st.error}</p>;
  const init = st.init;
  return (
    <p className="status">
      <span className="pill">synthetic data</span> A made-up city of {int(manifest.city.nodes)} intersections, {manifest.techs} technicians and {manifest.jobs} jobs, generated in your browser from the seed <code>&ldquo;{manifest.daySeed}&rdquo;</code>.{" "}
      {init ? (
        <>
          {init.verify.ok ? (
            <span className="ok" title={`SHA-256 ${init.verify.sha256}`}>
              Its SHA-256 matches the build manifest.
            </span>
          ) : (
            <span className="warn">The regenerated day differs from the build manifest.</span>
          )}{" "}
          <span className="muted">
            Morning plan: {int(init.morning.iterations)} iterations in {ms(init.morning.ms)}.
          </span>
        </>
      ) : (
        <span className="muted">Building the city and planning the morning…</span>
      )}
    </p>
  );
}

function Swatch({ kind }: { kind: string }) {
  const s = 14;
  const c = s / 2;
  const body = (() => {
    switch (kind) {
      case "tech":
        return (
          <>
            <circle cx={c} cy={c} r={6} fill="#62b6ff" stroke="#0b0c0e" strokeWidth={1.5} />
            <text x={c} y={c + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill="#0b0c0e">
              A
            </text>
          </>
        );
      case "planned":
        return <circle cx={c} cy={c} r={4.2} fill="#0b0c0e" stroke="#62b6ff" strokeWidth={1.7} />;
      case "onsite":
        return <circle cx={c} cy={c} r={4.2} fill="#62b6ff" stroke="#62b6ff" strokeWidth={1.7} />;
      case "late":
        return (
          <>
            <circle cx={c} cy={c} r={4.2} fill="#0b0c0e" stroke="#ff6b6b" strokeWidth={1.7} />
            <circle cx={c} cy={c} r={1.6} fill="#ff6b6b" />
          </>
        );
      case "done":
        return <circle cx={c} cy={c} r={2.6} fill="#5a6068" />;
      case "unassigned":
        return <path d={`M${c} ${c - 5.5}L${c + 5.5} ${c}L${c} ${c + 5.5}L${c - 5.5} ${c}Z`} fill="#ffb547" />;
      case "urgent":
        return (
          <>
            <circle cx={c} cy={c} r={3.4} fill="#0b0c0e" stroke="#62b6ff" strokeWidth={1.5} />
            <circle cx={c} cy={c} r={6.2} fill="none" stroke="#ecebe6" strokeWidth={1} />
          </>
        );
      case "moved":
        return <circle cx={c} cy={c} r={5.6} fill="none" stroke="#d4ff5a" strokeWidth={2} />;
      default:
        return null;
    }
  })();
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
      {body}
    </svg>
  );
}

const LEGEND: [string, string][] = [
  ["tech", "technician"],
  ["planned", "planned, ring in their colour"],
  ["onsite", "on site"],
  ["done", "done"],
  ["late", "will be late"],
  ["unassigned", "unassigned"],
  ["urgent", "urgent"],
  ["moved", "moved by the last re-plan"],
];

export default function App() {
  const st = useClient();
  useEffect(() => {
    void client.start();
  }, []);
  return (
    <>
      <a className="skip" href="#demo">
        Skip to the demo
      </a>
      <header className="topbar">
        <a className="back" href="/" title="Back to the portfolio">
          ← Alan Fung
        </a>
        <nav aria-label="Sections">
          <a href="#demo">Demo</a>
          <a href="#compare">Baselines</a>
          <a href="#numbers">Numbers</a>
          <a href="#how">How it works</a>
          <a href={SOURCE} target="_blank" rel="noopener">
            Source ↗
          </a>
        </nav>
      </header>

      <main>
        <section className="hero" id="demo" aria-labelledby="pitch">
          <div className="brand">
            <span className="logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path d="M4 18c3-8 6 2 9-6s5-4 7-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="4" cy="18" r="2.4" fill="currentColor" />
                <circle cx="20" cy="6" r="2.4" fill="currentColor" />
              </svg>
            </span>
            <span className="brand-name">Dispatch</span>
            <span className={`run-state is-${st.phase}`} aria-live="polite">
              <i />
              {st.phase === "ready" ? (st.busy ? "re-planning…" : "ready") : st.phase === "error" ? "stopped" : "planning the morning"}
            </span>
          </div>
          <h1 id="pitch">When a technician calls in sick at nine, does every customer still get their visit?</h1>
          <p className="lede">
            Dispatch plans a day of home-service visits for a team of technicians, then re-plans it every time the day changes: a sick call, an urgent job, a job that runs long, a traffic jam. It runs in a Web Worker in this tab, on the same code the evaluation measured.
          </p>
          <Status />
        </section>

        <div className="console">
          <StatusStrip />
          <div className="console-grid">
            <div className="card map-card">
              <div className="card-head">
                <h3>The city</h3>
                <span className="small muted">Click a technician to select them. Click a street to drop an urgent job there.</span>
              </div>
              <MapView />
              <ul className="map-legend small muted" aria-label="Map legend">
                {LEGEND.map(([k, label]) => (
                  <li key={k}>
                    <Swatch kind={k} /> {label}
                  </li>
                ))}
                <li>
                  <i className="lg-depot" /> depot
                </li>
              </ul>
            </div>
            <div className="side">
              <Controls />
              <Disrupt />
              <ReplanLog />
            </div>
          </div>
          <div className="card gantt-card">
            <div className="card-head">
              <h3>Each technician&rsquo;s day</h3>
              <span className="small muted">Click a name to select them, a visit to see the job.</span>
            </div>
            <Timeline />
          </div>
        </div>

        <section className="section" id="compare" aria-labelledby="h-compare">
          <div className="section-head">
            <h2 id="h-compare">The same day, three ways</h2>
            <p>Every event, scripted or yours, also goes to two baselines that do what a dispatch desk does without a solver. Each card is the end of the day as projected from the disruptions so far.</p>
          </div>
          <Compare />
        </section>

        <section className="section" id="demonstrates" aria-labelledby="h-demo">
          <div className="section-head">
            <h2 id="h-demo">What this demonstrates</h2>
          </div>
          <ul className="demonstrates">
            <li>
              <b>Re-planning on a deadline.</b> Each event re-plans the rest of the day within about {report.budgets.replanDeadlineMs} ms. What is done or under way stays put, so a customer told someone is on the way keeps their visit.
            </li>
            <li>
              <b>A real solver, written for this.</b> Regret insertion and adaptive large neighbourhood search, with a time-window check that stays O(1) and exact under rush-hour traffic. React is the only runtime dependency.
            </li>
            <li>
              <b>Baselines that get the same day.</b> A greedy dispatcher and the morning plan kept as it was replay exactly the same events and are scored by the same function.
            </li>
            <li>
              <b>Measured, not guessed.</b> Over {report.days} disrupted days, {pct(D.onTimeRate)} of visits on time against {pct(K.onTimeRate)} for keeping the morning plan and {pct(G.onTimeRate)} for greedy, with re-plans at {ms(report.latency.p50)} median and {ms(report.latency.p95)} p95 in Node.
            </li>
          </ul>
        </section>

        <section className="section" id="numbers" aria-labelledby="h-numbers">
          <div className="section-head">
            <h2 id="h-numbers">Measured, not guessed</h2>
            <p>
              <code>npm run eval</code> replays {report.days} seeded days with the same disruptions for every method and times every re-plan. These figures are imported from its output, <code>eval.json</code>, at build time.
            </p>
          </div>
          <Numbers />
        </section>

        <section className="section" id="how" aria-labelledby="h-how">
          <div className="section-head">
            <h2 id="h-how">How it works</h2>
            <p>Typed modules with no runtime dependency, shared by the page and by the evaluation script, so both measure the same code.</p>
          </div>
          <Architecture />
        </section>

        <section className="section" id="stack" aria-labelledby="h-stack">
          <div className="section-head">
            <h2 id="h-stack">Stack</h2>
          </div>
          <div className="stack">
            <div>
              <h3 className="label">Runs on</h3>
              <p>TypeScript, React 19 and Vite. The solver runs in one Web Worker. The map is Canvas 2D, the timeline plain DOM and CSS, and the SHA-256 check uses WebCrypto.</p>
            </div>
            <div>
              <h3 className="label">Written for this project</h3>
              <p>The seeded city and day generators, Dijkstra with a binary heap, time-dependent travel, route bookkeeping with forward slack, regret insertion, ALNS, the event simulator, both baselines and a VRPLIB reader for the Solomon set.</p>
            </div>
            <div>
              <h3 className="label">Checked by</h3>
              <p>
                <code>npm test</code> (node:test): RNG determinism, shortest paths against Floyd-Warshall, the slack check against brute-force simulation, insertion cost, re-plan freezing, an end-to-end day and solver determinism. <code>npm run all</code> runs data, eval, tests and build.
              </p>
            </div>
          </div>
          <p className="source-link">
            <a href={SOURCE} className="btn">
              Read the source on GitHub
            </a>
          </p>
        </section>
      </main>

      <footer className="foot">
        <p>
          Built by Alan Fung. <a href={SOURCE}>Source</a> · <a href="/">More projects</a>
        </p>
        <p className="muted small">The city, the technicians, the jobs and the traffic on this page are synthetic, generated from seeds.</p>
      </footer>
    </>
  );
}
