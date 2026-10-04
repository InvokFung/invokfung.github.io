import { useEffect, useMemo, useRef, useState } from "react";
import { firstPerPost, timed, type Engine, type Mode } from "../search/engine";
import type { EvalReport, Meta } from "../search/types";
import { ms, pct, quantile } from "./format";

const MODES: { id: Mode; label: string; sub: string }[] = [
  { id: "bm25", label: "Keyword", sub: "BM25" },
  { id: "lsa", label: "Meaning", sub: "LSA" },
  { id: "hybrid", label: "Fused", sub: "RRF" },
];

interface Cell {
  rank: number | null;
  ms: number;
}

type Grid = Record<Mode, (Cell | undefined)[]>;

const empty = (n: number): Grid => ({ bm25: new Array(n).fill(undefined), lsa: new Array(n).fill(undefined), hybrid: new Array(n).fill(undefined) });

function score(cells: (Cell | undefined)[]) {
  const done = cells.filter((c): c is Cell => !!c);
  const n = done.length || 1;
  return {
    done: done.length,
    hit1: done.filter((c) => c.rank === 1).length / n,
    hit5: done.filter((c) => c.rank !== null && c.rank <= 5).length / n,
    mrr: done.reduce((s, c) => s + (c.rank !== null && c.rank <= 10 ? 1 / c.rank : 0), 0) / n,
    p50: quantile(
      done.map((c) => c.ms),
      0.5,
    ),
  };
}

const tone = (c: Cell | undefined) => (!c ? "" : c.rank === 1 ? "r1" : c.rank !== null && c.rank <= 5 ? "r5" : c.rank !== null && c.rank <= 10 ? "r10" : "miss");

/** Reruns the build-time evaluation in the browser, one animation frame at a time. */
export default function Benchmark({ meta, engine, report }: { meta: Meta; engine: Engine; report: EvalReport }) {
  const n = report.questions.length;
  const [grid, setGrid] = useState<Grid>(() => empty(n));
  const [running, setRunning] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const root = useRef<HTMLElement>(null);
  const started = useRef(false);

  const postBySlug = useMemo(() => new Map(meta.posts.map((p, i) => [p.url.split("/").filter(Boolean).pop()!, i])), [meta]);
  const expected = useMemo(() => report.questions.map((q) => new Set(q.expect.map((s) => postBySlug.get(s)))), [report, postBySlug]);

  const run = () => {
    if (running) return;
    setRunning(true);
    const next = empty(n);
    setGrid(empty(n));
    let i = 0;
    const step = () => {
      const t0 = performance.now();
      while (i < n && performance.now() - t0 < 10) {
        const q = report.questions[i].q;
        for (const { id } of MODES) {
          const r = timed(() => firstPerPost(meta, engine.search(q, id, 100)), 1.5);
          const at = r.value.findIndex((h) => expected[i].has(meta.chunks[h.chunk].p));
          next[id][i] = { rank: at < 0 ? null : at + 1, ms: r.ms };
        }
        i++;
      }
      setGrid({ bm25: [...next.bm25], lsa: [...next.lsa], hybrid: [...next.hybrid] });
      if (i < n) requestAnimationFrame(step);
      else setRunning(false);
    };
    requestAnimationFrame(step);
  };

  // Run once, the first time the section scrolls into view.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          run();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scores = MODES.map((m) => ({ ...m, s: score(grid[m.id]) }));
  const finished = scores.every((m) => m.s.done === n);
  const matches = finished && scores.every((m) => Math.round(m.s.hit1 * n) === Math.round(report.summary[m.id].hit1 * n) && Math.round(m.s.hit5 * n) === Math.round(report.summary[m.id].hit5 * n));
  const hybridMs = grid.hybrid.filter((c): c is Cell => !!c).map((c) => c.ms);
  const fq = focus !== null ? report.questions[focus] : null;

  return (
    <section className="section bench" id="benchmark" ref={root}>
      <div className="section-head">
        <p className="eyebrow">Evaluation</p>
        <h2>{n} questions, rerun live in your browser</h2>
        <p className="lede">
          Each question is phrased the way a person would ask it, mostly without the post's own words, and names the post that answers it. The same script
          scores every build; here your browser runs all {n * MODES.length} searches again.
        </p>
      </div>

      <div className="bench-table" role="table">
        <div className="bench-row bench-header" role="row">
          <span role="columnheader">Mode</span>
          <span role="columnheader">Each square is one question</span>
          <span role="columnheader" className="num">
            Hit@1
          </span>
          <span role="columnheader" className="num">
            Hit@5
          </span>
          <span role="columnheader" className="num">
            MRR@10
          </span>
          <span role="columnheader" className="num">
            p50
          </span>
        </div>
        {scores.map(({ id, label, sub, s }) => (
          <div className={`bench-row ${id === "hybrid" ? "best" : ""}`} role="row" key={id}>
            <span className="bench-mode" role="cell">
              {label} <span className="muted mono">{sub}</span>
            </span>
            <span className="cells" role="cell">
              {grid[id].map((c, i) => (
                <button
                  key={i}
                  className={`cell ${tone(c)} ${focus === i ? "focus" : ""}`}
                  onMouseEnter={() => setFocus(i)}
                  onFocus={() => setFocus(i)}
                  onClick={() => setFocus(i)}
                  aria-label={`Question ${i + 1}: ${c ? (c.rank ? `rank ${c.rank}` : "not found") : "pending"}`}
                />
              ))}
            </span>
            <span className="num mono" role="cell">
              {s.done ? pct(s.hit1) : "–"}
            </span>
            <span className="num mono" role="cell">
              {s.done ? pct(s.hit5) : "–"}
            </span>
            <span className="num mono" role="cell">
              {s.done ? s.mrr.toFixed(3) : "–"}
            </span>
            <span className="num mono" role="cell">
              {s.done ? ms(s.p50) : "–"}
            </span>
          </div>
        ))}
      </div>

      <div className="bench-foot">
        <div className="legend-row">
          <span>
            <i className="cell r1" /> top result
          </span>
          <span>
            <i className="cell r5" /> top 5
          </span>
          <span>
            <i className="cell r10" /> top 10
          </span>
          <span>
            <i className="cell miss" /> missed
          </span>
        </div>
        <button className="ghost" onClick={run} disabled={running}>
          {running ? "Running…" : "Run again"}
        </button>
      </div>

      <div className="bench-detail" aria-live="polite">
        {fq ? (
          <>
            <span className="muted mono">Q{focus! + 1}</span> “{fq.q}”
            <span className="muted"> → {fq.expect.map((s) => meta.posts[postBySlug.get(s)!]?.title).join(" or ")}</span>
            <span className="mono">
              {MODES.map(({ id, label }) => {
                const c = grid[id][focus!];
                return (
                  <span key={id} className={`bench-rank ${tone(c)}`}>
                    {label} {c ? (c.rank ? `#${c.rank}` : "missed") : "…"}
                  </span>
                );
              })}
            </span>
          </>
        ) : (
          <span className="muted">Point at a square to see its question and where each mode ranked the answer.</span>
        )}
      </div>

      {finished && (
        <p className="bench-note">
          {matches ? "✓ Identical to the build-time report. " : "Differs from the build-time report. "}
          Fused queries took {ms(quantile(hybridMs, 0.5))} at the median and {ms(quantile(hybridMs, 0.95))} at p95 on this device.
        </p>
      )}
    </section>
  );
}
