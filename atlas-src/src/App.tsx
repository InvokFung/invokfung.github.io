import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { loadAtlas, type Atlas } from "./data";
import { firstPerPost, timed } from "./search/engine";
import Architecture from "./ui/Architecture";
import Benchmark from "./ui/Benchmark";
import Pipeline from "./ui/Pipeline";
import RankFlow from "./ui/RankFlow";
import Reader from "./ui/Reader";
import Results from "./ui/Results";
import { mb, ms, pct, quantile } from "./ui/format";

const EXAMPLES = [
  "store user passwords safely",
  "publish an event only if the write commits",
  "soft shadows over a large terrain",
  "every bounded monotone sequence converges",
  "first layer not sticking to the bed",
  "how to play vibrato",
];

const SOURCE = "https://github.com/InvokFung/invokfung.github.io/tree/main/atlas-src";
const SKILLS = ["Information retrieval", "Numerical linear algebra", "Performance engineering", "Evaluation design", "TypeScript", "React"];

export default function App() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(() => new URLSearchParams(location.hash.slice(1)).get("q") ?? "");
  const [selected, setSelected] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAtlas(setProgress).then(setAtlas, (e: Error) => setError(e.message));
  }, []);

  // A quick latency sample for the headline number: the benchmark questions, fused.
  useEffect(() => {
    if (!atlas?.evalReport) return;
    const id = setTimeout(() => {
      const times = atlas.evalReport!.questions.map((q) => timed(() => firstPerPost(atlas.meta, atlas.engine.search(q.q, "hybrid", 100)), 1).ms);
      setLatency(quantile(times, 0.5));
    }, 300);
    return () => clearTimeout(id);
  }, [atlas]);

  // Typing stays responsive; the search catches up a frame later.
  const deferred = useDeferredValue(query.trim());

  useEffect(() => {
    history.replaceState(null, "", deferred ? `#q=${encodeURIComponent(deferred)}` : location.pathname);
  }, [deferred]);

  const trace = useMemo(() => (atlas && deferred ? atlas.engine.trace(deferred) : null), [atlas, deferred]);
  const top = useMemo(() => (atlas && trace ? firstPerPost(atlas.meta, trace.fused.hits).slice(0, 8) : []), [atlas, trace]);

  useEffect(() => setActive(null), [trace]);

  const ask = useCallback((q: string) => {
    setQuery(q);
    setSelected(null);
    input.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== input.current) {
        e.preventDefault();
        input.current?.focus();
      } else if (e.key === "Escape") {
        if (selected !== null) setSelected(null);
        else if (document.activeElement === input.current) setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  useEffect(() => {
    document.body.style.overflow = selected !== null ? "hidden" : "";
  }, [selected]);

  const meta = atlas?.meta;
  const report = atlas?.evalReport ?? null;

  return (
    <>
      <header className="topbar">
        <a className="back" href="/" title="Back to the portfolio">
          ← InvokFung
        </a>
        <nav>
          <a href="#demo">Demo</a>
          <a href="#benchmark">Benchmark</a>
          <a href="#architecture">Architecture</a>
          <a href={SOURCE} target="_blank" rel="noopener">
            Source ↗
          </a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">StudyLog Atlas · client-side search engine</p>
          <h1>
            A search engine that runs in a <span className="grad">browser tab</span>.
          </h1>
          <p className="lede">
            Atlas answers questions over {meta ? meta.posts.length : "the"} posts of my StudyLog blog with no server. It fuses a BM25 keyword index with a
            semantic model built by my own randomized SVD, and a {report?.n ?? 60}-question benchmark checks every build.
          </p>
          <dl className="proof">
            <div>
              <dt>{report ? pct(report.summary.hybrid.hit1) : "…"}</dt>
              <dd>of benchmark questions answered by the top result</dd>
            </div>
            <div>
              <dt>{latency !== null ? ms(latency) : "…"}</dt>
              <dd>median query, measured just now on your device</dd>
            </div>
            <div>
              <dt>{meta ? mb(meta.stats.indexBytes) : "…"}</dt>
              <dd>binary index for {meta ? meta.chunks.length.toLocaleString("en-US") : "all"} passages</dd>
            </div>
            <div>
              <dt>0</dt>
              <dd>servers, APIs or ML libraries</dd>
            </div>
          </dl>
          <ul className="skills" aria-label="Skills shown">
            {SKILLS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="section demo" id="demo">
          <div className="search">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              ref={input}
              value={query}
              placeholder={atlas ? "Ask a question, e.g. how do I store passwords safely?" : "Loading the index…"}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              aria-label="Search the StudyLog"
              spellCheck={false}
            />
            {query ? (
              <button className="clear" onClick={() => ask("")} aria-label="Clear">
                ×
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </div>
          <div className="examples">
            <span className="muted">Try</span>
            {EXAMPLES.map((q) => (
              <button key={q} className={q === deferred ? "on" : ""} onClick={() => ask(q)}>
                {q}
              </button>
            ))}
          </div>

          {error ? (
            <p className="no-results">Could not load the index ({error}).</p>
          ) : !atlas || !meta ? (
            <div className="loading">
              <div className="bar">
                <div style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="muted mono">loading the index · {Math.round(progress * 100)}%</p>
            </div>
          ) : (
            <>
              <Pipeline meta={meta} trace={trace} query={deferred} kernel={atlas.engine.kernelName} />
              {trace && (
                <div className="answer">
                  <div>
                    <h2 className="label">Top posts for “{deferred}”</h2>
                    <Results meta={meta} hits={top} query={deferred} active={active} onActive={setActive} onOpen={setSelected} />
                  </div>
                  {top.length > 0 && (
                    <aside className="answer-side">
                      <h2 className="label">How the two lists fused</h2>
                      <RankFlow key={deferred} hits={top} active={active} onActive={setActive} />
                    </aside>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {atlas && meta && report && <Benchmark meta={meta} engine={atlas.engine} report={report} />}
        {atlas && meta && <Architecture meta={meta} engine={atlas.engine} report={report} />}
      </main>

      <footer className="foot">
        <span>
          Built by <a href="/">Afung (InvokFung)</a>.
        </span>
        <span>
          <a href={SOURCE} target="_blank" rel="noopener">
            Source on GitHub
          </a>
          {meta && <span className="muted"> · index built {meta.builtAt.slice(0, 10)}</span>}
        </span>
      </footer>

      {atlas && selected !== null && (
        <Reader meta={atlas.meta} engine={atlas.engine} chunk={selected} query={deferred} onSelect={setSelected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
