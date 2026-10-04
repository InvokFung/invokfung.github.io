import { useEffect, useState } from "react";
import { chunkText } from "../data";
import { rrf, type FusedHit } from "../search/engine";
import type { Meta } from "../search/types";
import { categoryColor } from "../palette";
import { snippet, type Segment } from "../snippet";

export function Marked({ segs }: { segs: Segment[] }) {
  return (
    <>
      {segs.map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </>
  );
}

export function useChunkText(meta: Meta, chunk: number | null) {
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

export function CategoryTag({ meta, i }: { meta: Meta; i: number }) {
  return (
    <span className="cat">
      <span className="dot" style={{ background: categoryColor(i) }} />
      {meta.categories[i]}
    </span>
  );
}

/** Each list's share of the fused score, out of the most one list can give. */
function Contribution({ hit }: { hit: FusedHit }) {
  const full = rrf(1);
  return (
    <div className="contrib" aria-label={`keyword rank ${hit.kw ?? "none"}, meaning rank ${hit.sem ?? "none"}`}>
      <div className="contrib-bar">
        <span className="kw" style={{ width: `${(rrf(hit.kw) / full) * 50}%` }} />
        <span className="sem" style={{ width: `${(rrf(hit.sem) / full) * 50}%` }} />
      </div>
      <span className="mono">
        <span className="kw-text">keyword {hit.kw ? `#${hit.kw}` : "–"}</span> · <span className="sem-text">meaning {hit.sem ? `#${hit.sem}` : "–"}</span>
      </span>
    </div>
  );
}

function ResultCard({ meta, hit, rank, query, active, onActive, onOpen }: { meta: Meta; hit: FusedHit; rank: number; query: string; active: boolean; onActive: (on: boolean) => void; onOpen: () => void }) {
  const c = meta.chunks[hit.chunk];
  const post = meta.posts[c.p];
  const text = useChunkText(meta, hit.chunk);
  return (
    <li>
      <button className={`result ${active ? "on" : ""}`} onClick={onOpen} onMouseEnter={() => onActive(true)} onMouseLeave={() => onActive(false)} onFocus={() => onActive(true)} onBlur={() => onActive(false)}>
        <span className="result-rank mono">{rank}</span>
        <span className="result-body">
          <span className="result-top">
            <CategoryTag meta={meta} i={post.category} />
            <span className="muted mono">{post.date}</span>
          </span>
          <span className="result-title">{post.title}</span>
          {c.h && <span className="result-heading">§ {c.h}</span>}
          <span className="result-snippet">{text === null ? <span className="shimmer" /> : <Marked segs={snippet(text, query)} />}</span>
          <Contribution hit={hit} />
        </span>
      </button>
    </li>
  );
}

export default function Results({ meta, hits, query, active, onActive, onOpen }: { meta: Meta; hits: FusedHit[]; query: string; active: number | null; onActive: (i: number | null) => void; onOpen: (chunk: number) => void }) {
  if (!hits.length) return <p className="no-results">Nothing in the index matches “{query}”. Try fewer or more common words.</p>;
  return (
    <ol className="results">
      {hits.map((h, i) => (
        <ResultCard key={h.chunk} meta={meta} hit={h} rank={i + 1} query={query} active={active === i} onActive={(on) => onActive(on ? i : null)} onOpen={() => onOpen(h.chunk)} />
      ))}
    </ol>
  );
}
