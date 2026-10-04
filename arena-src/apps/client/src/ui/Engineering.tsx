import facts from "../facts.json";

export const SOURCE_URL = "https://github.com/InvokFung/invokfung.github.io/tree/main/arena-src";

const DEMONSTRATES = [
  {
    title: "Authoritative server",
    body: "Clients only send intents (“flip card 7”). The server checks every flip against the engine and broadcasts the result. Face-down cards never leave it.",
  },
  {
    title: "Event sourcing",
    body: "Each match is an append-only log with optimistic concurrency. Replays, results and the Elo ladder are projections rebuilt from that log.",
  },
  {
    title: "Deterministic engine",
    body: "A pure reducer plus a seeded xoshiro128** RNG, with no I/O. The same code runs in Node, in a Web Worker and in this page.",
  },
  {
    title: "Provably fair deals",
    body: "SHA-256 commit-reveal: the hash of the deal is public before the first flip and the seed after the last, so every result can check the deal itself.",
  },
  {
    title: "Typed real-time protocol",
    body: "Discriminated unions shared end to end and validated at runtime. Connections are rate-limited, and resume tokens are HMAC-signed so a dropped player can reconnect.",
  },
  {
    title: "Built to operate",
    body: "Docker image, Compose with MongoDB, Kubernetes (probes, HPA, PDB, room affinity), Prometheus metrics and a graceful drain on SIGTERM.",
  },
];

const PIPELINE = [
  { n: "1", title: "Client", body: "React renders state and sends intents" },
  { n: "2", title: "Transport", body: "WebSocket to Node, or postMessage to a Web Worker" },
  { n: "3", title: "Protocol", body: "Validate, rate-limit, authenticate" },
  { n: "4", title: "Arena core", body: "Sessions, rooms, matchmaker, match timers" },
  { n: "5", title: "Engine", body: "decide(state, cmd) → events · apply(state, event)" },
  { n: "6", title: "Event store", body: "Memory · JSONL · MongoDB · IndexedDB" },
  { n: "7", title: "Projections", body: "Redacted live view, replays, Elo ladder" },
];

const STACK = ["TypeScript", "React 19", "Vite 8", "Node 22", "ws", "MongoDB", "IndexedDB", "Web Workers", "node:test", "Playwright", "Docker", "Kubernetes", "Prometheus"];

const fmt = (n: number) => n.toLocaleString("en-US");

export function Engineering() {
  const lt = facts.loadtest;
  return (
    <div className="eng" id="engineering">
      <section className="eng-block">
        <h2 className="section-title">What this demonstrates</h2>
        <div className="demo-grid">
          {DEMONSTRATES.map((d, i) => (
            <article key={d.title} className="tile glass">
              <span className="tile-n mono">{String(i + 1).padStart(2, "0")}</span>
              <h3>{d.title}</h3>
              <p>{d.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="eng-block">
        <h2 className="section-title">
          Measured <span className="muted small">· {facts.machine}</span>
        </h2>
        <div className="stats-grid">
          <div className="stat glass">
            <div className="stat-v mono">
              {facts.tests.passed}
              <small> / {facts.tests.total}</small>
            </div>
            <div className="stat-k">tests passing</div>
            <div className="stat-d muted">engine, protocol, core, server over real WebSockets{facts.tests.skipped === 0 ? ", MongoDB contract on a real mongod" : ""}</div>
          </div>
          <div className="stat glass">
            <div className="stat-v mono">{fmt(lt.clients)}</div>
            <div className="stat-k">concurrent WebSocket clients</div>
            <div className="stat-d muted">
              {fmt(lt.flipsPerSecond)} flips/s · {lt.matchesPerSecond} matches finished/s
            </div>
          </div>
          <div className="stat glass">
            <div className="stat-v mono">
              {lt.flipRttP50}
              <small> / {lt.flipRttP99} ms</small>
            </div>
            <div className="stat-k">flip round trip, p50 / p99</div>
            <div className="stat-d muted">validate, apply, fan out to 4 players, back to the sender</div>
          </div>
          <div className="stat glass">
            <div className="stat-v mono">
              {lt.serverCpu}
              <small>%</small>
            </div>
            <div className="stat-k">of one CPU core</div>
            <div className="stat-d muted">server process at that load, {lt.serverRssMiB} MiB resident</div>
          </div>
          <div className="stat glass">
            <div className="stat-v mono">
              {facts.bundle.appGzipKB}
              <small> kB</small>
            </div>
            <div className="stat-k">page JS, gzipped</div>
            <div className="stat-d muted">+ {facts.bundle.workerGzipKB} kB worker (the whole server)</div>
          </div>
        </div>
        <p className="fine muted">
          Load: the bundled server and {fmt(lt.clients)} bot clients over real WebSockets (each flipping 3–5 times a second, faster than a person) on one shared machine, so treat these as an order of magnitude. Numbers are written by <code>npm run loadtest</code> and <code>npm run facts</code>; the README has the full table and the method.
        </p>
      </section>

      <section className="eng-block">
        <h2 className="section-title">How a flip travels</h2>
        <ol className="pipeline">
          {PIPELINE.map((s) => (
            <li key={s.n} className="glass">
              <span className="step mono">{s.n}</span>
              <div>
                <h3>{s.title}</h3>
                <p className="muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="fine muted">
          Steps 3–7 are the same TypeScript in both hosts. On GitHub Pages they run in a Web Worker (Local Arena). Pointed at a server, the page speaks the same protocol over a WebSocket.
        </p>
      </section>

      <section className="eng-block stack-row">
        <div className="chips">
          {STACK.map((s) => (
            <span key={s} className="chip">
              {s}
            </span>
          ))}
        </div>
        <a className="btn" href={SOURCE_URL} target="_blank" rel="noreferrer">
          Source on GitHub ↗
        </a>
      </section>
    </div>
  );
}
