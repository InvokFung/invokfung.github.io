import { useEffect, useMemo, useRef } from "react";
import type { Engine } from "../search/engine";
import type { Meta } from "../search/types";
import { highlight } from "../snippet";
import { CategoryTag, Marked, useChunkText } from "./Results";

function postLink(meta: Meta, chunk: number) {
  const c = meta.chunks[chunk];
  return meta.posts[c.p].url + (c.a ? `#${c.a}` : "");
}

/** A side drawer with one passage, its neighbours, and the closest passages elsewhere. */
export default function Reader({ meta, engine, chunk, query, onSelect, onClose }: { meta: Meta; engine: Engine; chunk: number; query: string; onSelect: (c: number) => void; onClose: () => void }) {
  const c = meta.chunks[chunk];
  const post = meta.posts[c.p];
  const text = useChunkText(meta, chunk);
  const related = useMemo(() => engine.related(chunk, 5), [engine, chunk]);
  const idx = chunk - post.first;
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
    panel.current?.focus({ preventScroll: true });
  }, [chunk]);
  return (
    <div className="drawer-bg" onClick={onClose}>
      <aside className="drawer" ref={panel} tabIndex={-1} onClick={(e) => e.stopPropagation()} aria-label="Passage">
        <div className="drawer-head">
          <span className="muted mono">
            passage {idx + 1} of {post.count}
          </span>
          <button className="ghost" onClick={onClose} aria-label="Close">
            Close ✕
          </button>
        </div>
        <div className="result-top">
          <CategoryTag meta={meta} i={post.category} />
          <span className="muted mono">{post.date}</span>
        </div>
        <h2 className="drawer-title">{post.title}</h2>
        {c.h && <div className="result-heading">§ {c.h}</div>}
        <p className="drawer-text">{text === null ? <span className="shimmer" /> : <Marked segs={highlight(text, query)} />}</p>
        <div className="drawer-nav">
          <button className="ghost" disabled={idx === 0} onClick={() => onSelect(chunk - 1)}>
            ‹ Previous
          </button>
          <a className="primary" href={postLink(meta, chunk)} target="_blank" rel="noopener">
            Open the post ↗
          </a>
          <button className="ghost" disabled={idx === post.count - 1} onClick={() => onSelect(chunk + 1)}>
            Next ›
          </button>
        </div>
        <h3 className="label">More like this, by LSA cosine</h3>
        <ul className="related">
          {related.map((h) => {
            const rc = meta.chunks[h.chunk];
            const rp = meta.posts[rc.p];
            return (
              <li key={h.chunk}>
                <button onClick={() => onSelect(h.chunk)}>
                  <span>
                    <span className="related-title">{rp.title}</span>
                    {rc.h && <span className="related-heading">{rc.h}</span>}
                  </span>
                  <span className="mono muted">{h.score.toFixed(2)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
