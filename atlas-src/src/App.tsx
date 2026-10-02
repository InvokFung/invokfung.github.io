import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Galaxy, { type Focus } from "./Galaxy";
import { chunkText, loadAtlas, type Atlas } from "./data";
import { firstPerPost, type Hit, type Mode } from "./search/engine";
import { categoryColor } from "./palette";
import { highlight, snippet, type Segment } from "./snippet";
import type { Meta } from "./search/types";

const EXAMPLES = [
  "store user passwords safely",
  "soft shadows over a large terrain",
  "publish an event only if the write commits",
  "every bounded monotone sequence converges",
  "how to play vibrato",
  "first layer not sticking to the bed",
];

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "hybrid", label: "Hybrid", hint: "Keyword and meaning, fused by reciprocal rank" },
  { id: "bm25", label: "Keyword", hint: "BM25 over exact terms" },
  { id: "lsa", label: "Meaning", hint: "Latent semantic analysis (truncated SVD)" },
];

const fmt = (n: number) => n.toLocaleString("en-US");

function Marked({ segs }: { segs: Segment[] }) {
  return (
    <>
      {segs.map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </>
  );
}

function useChunkText(meta: Meta, chunk: number | null) {
  const [text, setText] = useState<{ chunk: number; text: string } | null>(null);
  useEffect(() => {
    if (chunk === null) return;
    let live = true;
    chunkText(meta, chunk).then((t) => live && setText({ chunk, text: t }));
    return () => {
      live = false;
    };
  }, [meta, chunk]);
  return text && text.chunk === chunk ? text.text : null;
}

function postLink(meta: Meta, chunk: number) {
  const c = meta.chunks[chunk];
  return meta.posts[c.p].url + (c.a ? `#${c.a}` : "");
}

function CategoryDot({ i }: { i: number }) {
  return <span className="dot" style={{ background: categoryColor(i), boxShadow: `0 0 10px ${categoryColor(i)}` }} />;
}

function ResultCard({ atlas, hit, query, why, onOpen }: { atlas: Atlas; hit: Hit; query: string; why: string; onOpen: () => void }) {
  const { meta } = atlas;
  const c = meta.chunks[hit.chunk];
  const post = meta.posts[c.p];
  const text = useChunkText(meta, hit.chunk);
  return (
    <button className="result" onClick={onOpen}>
      <div className="result-top">
        <CategoryDot i={post.category} />
        <span className="result-cat">{meta.categories[post.category]}</span>
        <span className="result-why">{why}</span>
      </div>
      <div className="result-title">{post.title}</div>
      {c.h && <div className="result-heading">§ {c.h}</div>}
      <div className="result-snippet">{text === null ? <span className="shimmer" /> : <Marked segs={snippet(text, query)} />}</div>
    </button>
  );
}

function Detail({ atlas, chunk, query, onSelect, onClose }: { atlas: Atlas; chunk: number; query: string; onSelect: (c: number) => void; onClose: () => void }) {
  const { meta, engine } = atlas;
  const c = meta.chunks[chunk];
  const post = meta.posts[c.p];
  const text = useChunkText(meta, chunk);
  const related = useMemo(() => engine.related(chunk, 6), [engine, chunk]);
  const idx = chunk - post.first;
  return (
    <div className="detail">
      <div className="panel-head">
        <button className="ghost" onClick={onClose}>
          ← {query ? "Results" : "Back"}
        </button>
        <span className="muted mono">
          passage {idx + 1} / {post.count}
        </span>
      </div>
      <div className="result-top">
        <CategoryDot i={post.category} />
        <span className="result-cat">{meta.categories[post.category]}</span>
        <span className="muted mono">{post.date}</span>
      </div>
      <h2 className="detail-title">{post.title}</h2>
      {c.h && <div className="result-heading">§ {c.h}</div>}
      <p className="detail-text">{text === null ? <span className="shimmer" /> : <Marked segs={highlight(text, query)} />}</p>
      <div className="detail-nav">
        <button className="ghost" disabled={idx === 0} onClick={() => onSelect(chunk - 1)}>
          ‹ Previous
        </button>
        <a className="primary" href={postLink(meta, chunk)} target="_blank" rel="noopener">
          Read in StudyLog ↗
        </a>
        <button className="ghost" disabled={idx === post.count - 1} onClick={() => onSelect(chunk + 1)}>
          Next ›
        </button>
      </div>
      <h3 className="section-label">Closest passages in other posts</h3>
      <div className="related">
        {related.map((h) => {
          const rc = meta.chunks[h.chunk];
          const rp = meta.posts[rc.p];
          return (
            <button key={h.chunk} className="related-item" onClick={() => onSelect(h.chunk)}>
              <CategoryDot i={rp.category} />
              <span>
                <span className="related-title">{rp.title}</span>
                {rc.h && <span className="related-heading">{rc.h}</span>}
              </span>
              <span className="mono muted">{h.score.toFixed(2)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function About({ atlas, onClose }: { atlas: Atlas; onClose: () => void }) {
  const { meta, evalReport } = atlas;
  const s = meta.stats;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>How the Atlas works</h2>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p>
          Every post in the StudyLog is split at its headings into {fmt(meta.chunks.length)} passages. The whole pipeline runs at build time in
          TypeScript with no external model or API, and search runs entirely in your browser.
        </p>
        <ol className="steps">
          <li>
            <b>Keyword index.</b> A BM25 inverted index over {fmt(s.vocabulary)} terms and {fmt(s.postings)} postings, packed into typed arrays.
          </li>
          <li>
            <b>Meaning.</b> A TF-IDF matrix of {fmt(meta.chunks.length)} × {fmt(s.lsaVocabulary)} is reduced with a randomized truncated SVD (Halko et
            al.) to {meta.lsa.k} dimensions, capturing {pct(s.variance)} of the variance. Queries are folded into the same space through V.
          </li>
          <li>
            <b>Fusion.</b> Hybrid mode merges both rankings with reciprocal rank fusion, so a passage that ranks well on either signal surfaces.
          </li>
          <li>
            <b>The map.</b> UMAP projects the {meta.lsa.k}-dimensional passage vectors into 3D. Nearby stars share meaning, even across courses.
          </li>
        </ol>
        {evalReport && (
          <>
            <h3 className="section-label">Measured on {evalReport.n} hand-written questions</h3>
            <p className="muted">
              Each question names the post that answers it. Hit@1 is how often that post is the top result; MRR@10 rewards ranking it higher.
            </p>
            <table className="eval">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Hit@1</th>
                  <th>Hit@5</th>
                  <th>MRR@10</th>
                </tr>
              </thead>
              <tbody>
                {MODES.map((m) => {
                  const r = evalReport.summary[m.id];
                  return (
                    <tr key={m.id} className={m.id === "hybrid" ? "best" : ""}>
                      <td>{m.label}</td>
                      <td>{pct(r.hit1)}</td>
                      <td>{pct(r.hit5)}</td>
                      <td>{r.mrr.toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <details>
              <summary>All questions and the rank of the right post</summary>
              <table className="eval small">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Keyword</th>
                    <th>Meaning</th>
                    <th>Hybrid</th>
                  </tr>
                </thead>
                <tbody>
                  {evalReport.questions.map((q) => (
                    <tr key={q.q}>
                      <td>{q.q}</td>
                      {(["bm25", "lsa", "hybrid"] as const).map((m) => (
                        <td key={m} className={q.rank[m] === 1 ? "top" : q.rank[m] === null ? "miss" : ""}>
                          {q.rank[m] ?? "–"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
        <p className="muted small-print">
          Index built {meta.builtAt.slice(0, 10)}. Source:{" "}
          <a href="https://github.com/InvokFung/invokfung.github.io/tree/main/atlas-src" target="_blank" rel="noopener">
            atlas-src on GitHub
          </a>
          .
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(() => new URLSearchParams(location.hash.slice(1)).get("q") ?? "");
  const [mode, setMode] = useState<Mode>("hybrid");
  const [selected, setSelected] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [hover, setHover] = useState<{ chunk: number; x: number; y: number } | null>(null);
  const [about, setAbout] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAtlas(setProgress).then(setAtlas, (e: Error) => setError(e.message));
  }, []);

  // Typing stays responsive; the search and the scene catch up a frame later.
  const deferredQuery = useDeferredValue(query.trim());

  useEffect(() => {
    history.replaceState(null, "", deferredQuery ? `#q=${encodeURIComponent(deferredQuery)}` : location.pathname);
  }, [deferredQuery]);

  const results = useMemo(() => {
    if (!atlas || !deferredQuery) return null;
    const { engine, meta } = atlas;
    const hits = engine.search(deferredQuery, mode, 120).filter((h) => !hidden.has(meta.posts[meta.chunks[h.chunk].p].category));
    const kw = new Map(engine.bm25(deferredQuery, 100).map((h, i) => [h.chunk, i + 1]));
    const sem = new Map(engine.lsa(deferredQuery, 100).map((h, i) => [h.chunk, i + 1]));
    const why = (c: number) => {
      const a = kw.get(c);
      const b = sem.get(c);
      if (mode === "bm25") return a ? `keyword #${a}` : "";
      if (mode === "lsa") return b ? `meaning #${b}` : "";
      return [a && `keyword #${a}`, b && `meaning #${b}`].filter(Boolean).join(" · ");
    };
    return { hits, top: firstPerPost(meta, hits).slice(0, 10), why };
  }, [atlas, deferredQuery, mode, hidden]);

  const focus = useMemo<Focus>(() => {
    const weights = new Map<number, number>();
    if (!atlas) return { weights, frame: [] };
    const { meta } = atlas;
    if (selected !== null) {
      const post = meta.posts[meta.chunks[selected].p];
      for (let i = post.first; i < post.first + post.count; i++) weights.set(i, 0.45);
      weights.set(selected, 1);
      return { weights, frame: [selected] };
    }
    if (results) {
      results.hits.slice(0, 80).forEach((h, r) => weights.set(h.chunk, Math.max(0.3, 1 - r / 90)));
      return { weights, frame: results.top.slice(0, 6).map((h) => h.chunk) };
    }
    return { weights, frame: [] };
  }, [atlas, selected, results]);

  const select = useCallback((c: number) => setSelected(c), []);
  const onHover = useCallback((chunk: number | null, x: number, y: number) => setHover(chunk === null ? null : { chunk, x, y }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== input.current) {
        e.preventDefault();
        input.current?.focus();
      } else if (e.key === "Escape") {
        if (about) setAbout(false);
        else if (selected !== null) setSelected(null);
        else setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [about, selected]);

  const layout = atlas?.engine.ix.layout;

  if (error)
    return (
      <div className="loading">
        <p>Could not load the Atlas data ({error}).</p>
      </div>
    );
  if (!atlas || !layout)
    return (
      <div className="loading">
        <div className="brand-big">
          StudyLog <span className="grad">Atlas</span>
        </div>
        <div className="bar">
          <div style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="muted mono">mapping {progress < 1 ? "passages" : "the galaxy"}…</p>
      </div>
    );

  const { meta } = atlas;
  const counts = meta.categories.map((_, i) => meta.posts.filter((p) => p.category === i).length);
  const hc = hover ? meta.chunks[hover.chunk] : null;

  return (
    <div className="app">
      <Galaxy meta={meta} layout={layout} focus={focus} hiddenCategories={hidden} selected={selected} panelOpen={selected !== null || !!results} onHover={onHover} onSelect={select} />

      <header className="top">
        <a className="brand" href="/" title="Back to the portfolio">
          StudyLog <span className="grad">Atlas</span>
        </a>
        <div className="stats mono">
          {meta.posts.length} posts · {fmt(meta.chunks.length)} passages · mapped by meaning
        </div>
      </header>

      <div className="search">
        <div className="search-box">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={input}
            value={query}
            placeholder="Ask your notes anything…"
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            aria-label="Search the StudyLog"
          />
          {query ? (
            <button className="clear" onClick={() => (setQuery(""), setSelected(null))} aria-label="Clear">
              ×
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </div>
        <div className="modes" role="radiogroup" aria-label="Search mode">
          {MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={mode === m.id} className={mode === m.id ? "on" : ""} title={m.hint} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <aside className={`panel ${selected !== null || results ? "open" : ""}`}>
        {selected !== null ? (
          <Detail atlas={atlas} chunk={selected} query={deferredQuery} onSelect={select} onClose={() => setSelected(null)} />
        ) : results ? (
          <>
            <div className="panel-head">
              <span className="muted">
                {results.top.length ? `Top posts for “${deferredQuery}”` : `Nothing matched “${deferredQuery}”`}
              </span>
            </div>
            <div className="results">
              {results.top.map((h) => (
                <ResultCard key={h.chunk} atlas={atlas} hit={h} query={deferredQuery} why={results.why(h.chunk)} onOpen={() => select(h.chunk)} />
              ))}
            </div>
          </>
        ) : null}
      </aside>

      {!results && selected === null && (
        <div className="intro">
          <p>
            Each star is a passage from the StudyLog, placed by meaning, so related ideas sit together even across courses. Drag to orbit, scroll to zoom,
            click a star to read it.
          </p>
          <div className="examples">
            {EXAMPLES.map((q) => (
              <button key={q} onClick={() => setQuery(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="legend" aria-label="Categories">
        {meta.categories.map((name, i) => (
          <button
            key={name}
            className={hidden.has(i) ? "off" : ""}
            onClick={() =>
              setHidden((h) => {
                const n = new Set(h);
                if (n.has(i)) n.delete(i);
                else n.add(i);
                return n;
              })
            }
            onDoubleClick={() => setHidden(new Set(meta.categories.map((_, j) => j).filter((j) => j !== i)))}
            title="Click to toggle, double-click to show only this"
          >
            <CategoryDot i={i} />
            {name}
            <span className="muted mono">{counts[i]}</span>
          </button>
        ))}
        {hidden.size > 0 && (
          <button className="reset" onClick={() => setHidden(new Set())}>
            Show all
          </button>
        )}
      </nav>

      <button className="about-btn" onClick={() => setAbout(true)}>
        How it works
      </button>

      {hover && hc && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="tooltip-title">{meta.posts[hc.p].title}</div>
          {hc.h && <div className="tooltip-heading">{hc.h}</div>}
        </div>
      )}

      {about && <About atlas={atlas} onClose={() => setAbout(false)} />}
    </div>
  );
}
