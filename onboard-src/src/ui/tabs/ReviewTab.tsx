// The review queue: pairs between the two thresholds, strongest first.
// A (same customer) and R (different) decide; S skips; U undoes. Each
// decision re-clusters every record in the worker and updates the live score.

import { useCallback, useEffect, useRef, useState } from "react";
import { client, useClient, useView } from "../../client";
import { int, pct, prob as fmtProb } from "../../format";
import { sourceColor, sourceShort } from "../../palette";
import type { RecordView, ReviewView } from "../../worker/protocol";
import { EdgeExplain } from "../Spotlight";

// Fields whose normalized value the worker sends; these are compared after
// normalization, so "919.799.0633" and "001 919 799 0633" count as the same.
const NORMALIZED: Record<string, "email" | "phone" | "dob" | "country"> = { email: "email", phone: "phone", date_of_birth: "dob", country: "country" };
const normalized = (r: RecordView, field: string | null) => (field && NORMALIZED[field] ? r[NORMALIZED[field]] || null : null);

function Side({ r, order, other }: { r: RecordView; order: string[]; other: RecordView }) {
  const otherVals = new Set(other.cells.map((c) => `${c.field}:${c.raw.trim().toLowerCase()}`));
  const same = (field: string | null, raw: string) => {
    const n = normalized(r, field);
    return n ? n === normalized(other, field) : otherVals.has(`${field}:${raw.trim().toLowerCase()}`);
  };
  return (
    <div className="side" style={{ color: sourceColor(r.source, order) }}>
      <header>
        <span className="src-chip">{sourceShort(r.source)}</span>
        <span className="mono muted small">
          {r.source === "billing" ? "line" : "row"} {int(r.line)}
        </span>
      </header>
      <dl>
        {r.cells
          .filter((c) => c.field && c.raw.trim() && c.field !== "notes")
          .map((c) => (
            <div key={c.index} className={`cell ${same(c.field, c.raw) ? "is-same" : ""}`}>
              <dt>{c.column}</dt>
              <dd className="mono">{c.raw}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

export default function ReviewTab() {
  const st = useClient();
  const order = st.overview?.sources.map((s) => s.id) ?? [];
  const v = useView<ReviewView>({ type: "review", offset: 0, limit: 12 });
  const [skip, setSkip] = useState(0);
  const [history, setHistory] = useState<{ pair: number; same: boolean; truth: boolean | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const d = v.data;
  const item = d?.items[Math.min(skip, Math.max(0, (d?.items.length ?? 1) - 1))];

  const decide = useCallback(
    async (same: boolean) => {
      if (!item || busy) return;
      setBusy(true);
      try {
        await client.mutate({ type: "decide", pair: item.edge.pair, same });
        setHistory((h) => [{ pair: item.edge.pair, same, truth: item.truth }, ...h].slice(0, 50));
        setSkip(0);
      } finally {
        setBusy(false);
      }
    },
    [item, busy],
  );
  const undo = useCallback(async () => {
    const last = history[0];
    if (!last || busy) return;
    setBusy(true);
    try {
      await client.mutate({ type: "decide", pair: last.pair, same: null });
      setHistory((h) => h.slice(1));
    } finally {
      setBusy(false);
    }
  }, [history, busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (!box.current || !isVisible(box.current)) return;
      const k = e.key.toLowerCase();
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (k === "a") void decide(true);
      else if (k === "r") void decide(false);
      else if (k === "s") setSkip((x) => x + 1);
      else if (k === "u") void undo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, undo]);

  if (!d) return <div className="spot-skeleton">Loading the queue…</div>;
  const right = history.filter((h) => h.truth !== null && h.truth === h.same).length;
  const judged = history.filter((h) => h.truth !== null).length;
  const prior = item ? item.edge.weight - item.edge.levels.reduce((a, l) => a + l.weight, 0) : 0;

  return (
    <div className="tab-body review" ref={box}>
      <p className="tab-intro">
        Pairs scored between the review threshold ({st.overview?.thresholds.review}) and the match threshold ({st.overview?.thresholds.match}) are not guessed: they wait here, strongest first, together with pairs a guard rule stopped. Keys: <kbd>A</kbd> same customer, <kbd>R</kbd> different, <kbd>S</kbd> skip, <kbd>U</kbd> undo.
      </p>
      <div className="review-stats">
        <span>
          <b className="mono">{int(d.pending)}</b> waiting
        </span>
        <span>
          <b className="mono">{int(d.decided)}</b> decided
        </span>
        {d.score && (
          <span>
            live pairwise F1 <b className="mono">{d.score.pairwise.f1.toFixed(3)}</b> <span className="muted">(precision {pct(d.score.pairwise.precision)}, recall {pct(d.score.pairwise.recall)})</span>
          </span>
        )}
        {judged > 0 && (
          <span>
            your answers: <b className="mono">{right}</b> of {judged} agree with the generator
          </span>
        )}
      </div>
      {item ? (
        <div className={`review-card ${busy ? "is-busy" : ""}`}>
          <div className="pair-sides">
            <Side r={item.a} other={item.b} order={order} />
            <div className="pair-mid">
              <span className="mono big">{fmtProb(item.edge.prob)}</span>
              <span className="muted small">match probability</span>
            </div>
            <Side r={item.b} other={item.a} order={order} />
          </div>
          <EdgeExplain e={item.edge} a={item.a} b={item.b} prior={prior} order={order} />
          <div className="review-actions">
            <button className="btn yes" onClick={() => void decide(true)} disabled={busy}>
              <kbd>A</kbd> Same customer
            </button>
            <button className="btn no" onClick={() => void decide(false)} disabled={busy}>
              <kbd>R</kbd> Different
            </button>
            <button className="btn ghost" onClick={() => setSkip((x) => x + 1)} disabled={busy}>
              <kbd>S</kbd> Skip
            </button>
            <button className="btn ghost" onClick={() => void undo()} disabled={busy || !history.length}>
              <kbd>U</kbd> Undo
            </button>
          </div>
          {history[0] && history[0].truth !== null && (
            <p className={`verdict ${history[0].truth === history[0].same ? "ok" : "bad"}`} aria-live="polite">
              Last answer: you said {history[0].same ? "same" : "different"}; the generator made them {history[0].truth ? "the same customer" : "different customers"}.
            </p>
          )}
        </div>
      ) : (
        <p className="muted">The queue is empty.</p>
      )}
      {st.overview?.mode === "demo" && d.pending > 0 && (
        <div className="oracle">
          <button className="btn ghost small" disabled={busy || st.busy} onClick={() => void client.mutate({ type: "oracle" })}>
            Answer all {int(d.pending)} from the generator&rsquo;s truth
          </button>
          <span className="muted small">This is the eval&rsquo;s &ldquo;review queue resolved&rdquo; row: what a careful reviewer would reach.</span>
        </div>
      )}
      {d.items.length > 1 && (
        <>
          <h4 className="label">Next in the queue</h4>
          <ol className="queue">
            {d.items.slice(0, 10).map((x, i) => (
              <li key={x.edge.pair} className={i === skip ? "is-on" : ""}>
                <span className="mono">{fmtProb(x.edge.prob)}</span>
                <span>
                  {x.a.name || "(no name)"} <span className="muted">·</span> {x.b.name || "(no name)"}
                </span>
                {x.edge.veto.length > 0 && <span className="tag bad">{x.edge.veto[0]}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight;
}
