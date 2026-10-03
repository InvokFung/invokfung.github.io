import type { ReactNode } from "react";
import { firstPerPost, type Hit, type Trace } from "../search/engine";
import type { Meta } from "../search/types";
import Wire from "./Wire";
import { fmt, ms } from "./format";

const KW = "var(--kw)";
const SEM = "var(--sem)";
const FUSE = "var(--fuse)";
const LANE_GAP = 14;

function TopPosts({ meta, hits, score }: { meta: Meta; hits: Hit[]; score: (h: Hit) => string }) {
  const top = firstPerPost(meta, hits).slice(0, 3);
  if (!top.length) return <p className="stage-empty">No passage matched.</p>;
  return (
    <ol className="mini">
      {top.map((h) => (
        <li key={h.chunk}>
          <span className="mini-title">{meta.posts[meta.chunks[h.chunk].p].title}</span>
          <span className="mono">{score(h)}</span>
        </li>
      ))}
    </ol>
  );
}

/** The query's 96 LSA coordinates as a bar code: up for positive, down for negative. */
function Fingerprint({ v }: { v: Float32Array | null }) {
  const k = v?.length ?? 96;
  let max = 1e-6;
  if (v) for (const x of v) max = Math.max(max, Math.abs(x));
  return (
    <svg className="fingerprint" viewBox={`0 0 ${k * 3} 40`} preserveAspectRatio="none" aria-label="Query vector">
      <line x1={0} x2={k * 3} y1={20} y2={20} className="fp-axis" />
      {v &&
        Array.from(v, (x, d) => {
          // square root so the many small coordinates stay visible next to the few large ones
          const h = Math.sqrt(Math.abs(x) / max) * 19;
          return <rect key={d} x={d * 3} width={2.2} y={x > 0 ? 20 - h : 20} height={Math.max(0.6, h)} className={x > 0 ? "" : "neg"} />;
        })}
    </svg>
  );
}

function Stage({ n, title, sub, time, className, pulse, children }: { n: string; title: string; sub: string; time?: number; className?: string; pulse?: { key: string; delay: number }; children: ReactNode }) {
  return (
    <section className={`stage ${className ?? ""}`}>
      {pulse && <span key={pulse.key} className="flash" style={{ animationDelay: `${pulse.delay}s` }} aria-hidden />}
      <header>
        <span className="stage-n mono">{n}</span>
        <span className="stage-title">{title}</span>
        {time !== undefined && <span className="stage-time mono">{ms(time)}</span>}
      </header>
      <p className="stage-sub">{sub}</p>
      {children}
    </section>
  );
}

export default function Pipeline({ meta, trace, query, kernel }: { meta: Meta; trace: Trace | null; query: string; kernel: string }) {
  const active = !!trace;
  const key = query;
  const N = meta.chunks.length;
  return (
    <div className={`pipeline ${active ? "live" : "idle"}`}>
      <Stage n="1" title="Tokenize" sub="The indexer's own tokenizer: aliases, plural folding, stop words, CJK bigrams." className="s-tok" pulse={active ? { key, delay: 0 } : undefined}>
        {trace ? (
          <div className="tokens">
            {trace.words.map((w, i) =>
              w.tokens.length === 0 ? (
                <span key={i} className="tok dropped" title="Stop word, dropped">
                  {w.text}
                </span>
              ) : (
                w.tokens.map((t, j) => (
                  <span
                    key={`${i}.${j}`}
                    className={`tok ${t.known ? "" : "unknown"}`}
                    title={t.known ? `in ${fmt(t.df)} of ${fmt(N)} passages · idf ${t.idf.toFixed(2)}${t.lsa ? "" : " · keyword only"}` : "Not in the index"}
                  >
                    {t.t}
                    {t.known && <i style={{ width: `${Math.min(100, (t.idf / 8) * 100)}%` }} />}
                  </span>
                ))
              ),
            )}
          </div>
        ) : (
          <p className="stage-empty">Waiting for a question.</p>
        )}
      </Stage>

      <Wire kind="fork" gap={LANE_GAP} colors={[KW, SEM]} active={active} pulseKey={key} delay={0.05} />

      <div className="lanes" style={{ rowGap: LANE_GAP }}>
        <Stage n="2a" title="Keyword · BM25" sub="Walks the inverted index for each term." time={trace?.bm25.ms} className="s-kw" pulse={active ? { key, delay: 0.3 } : undefined}>
          {trace ? (
            <>
              <p className="metric">
                <b>{fmt(trace.bm25.postings)}</b> postings → <b>{fmt(trace.bm25.scored)}</b> passages scored
              </p>
              <TopPosts meta={meta} hits={trace.bm25.hits} score={(h) => h.score.toFixed(1)} />
            </>
          ) : (
            <p className="stage-empty">{fmt(meta.stats.vocabulary)} terms · {fmt(meta.stats.postings)} postings</p>
          )}
        </Stage>
        <Stage n="2b" title={`Meaning · LSA ${meta.lsa.k}-d`} sub={`Folds the query into the SVD space, then scores every passage (${kernel}).`} time={trace?.lsa.ms} className="s-sem" pulse={active ? { key, delay: 0.3 } : undefined}>
          <Fingerprint v={trace?.lsa.vector ?? null} />
          {trace ? (
            trace.lsa.vector ? (
              <TopPosts meta={meta} hits={trace.lsa.hits} score={(h) => h.score.toFixed(2)} />
            ) : (
              <p className="stage-empty">No term of this query is in the semantic vocabulary.</p>
            )
          ) : (
            <p className="stage-empty">
              {fmt(N)} passages × {meta.lsa.k} dims, int8
            </p>
          )}
        </Stage>
      </div>

      <Wire kind="join" gap={LANE_GAP} colors={[KW, SEM]} active={active} pulseKey={key} delay={0.35} />

      <Stage n="3" title="Rank fusion" sub="Reciprocal rank fusion needs no score calibration between the two lists." time={trace?.fused.ms} className="s-fuse" pulse={active ? { key, delay: 0.6 } : undefined}>
        <p className="formula mono">
          score = Σ 1/(60 + rank)
        </p>
        {trace ? (
          <p className="metric">
            <b>{fmt(trace.fused.union)}</b> candidates, <b>{fmt(trace.fused.both)}</b> found by both lists
          </p>
        ) : (
          <p className="stage-empty">Top 100 of each list in, one ranking out.</p>
        )}
      </Stage>

      <Wire kind="line" colors={[FUSE]} active={active} pulseKey={key} delay={0.6} />

      <Stage n="4" title="Answer" sub="Best passage per post, linked to its section." className="s-out" pulse={active ? { key, delay: 0.85 } : undefined}>
        {trace ? (
          <>
            <p className="total mono">{ms(trace.ms)}</p>
            <p className="metric">end to end, on this device</p>
          </>
        ) : (
          <p className="stage-empty">No server involved.</p>
        )}
      </Stage>
    </div>
  );
}
