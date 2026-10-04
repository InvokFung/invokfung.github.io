// The same few customers before (as each system exported them, in its own
// columns and spellings) and after (one golden row each).

import { useState } from "react";
import { useClient, useView } from "../client";
import { sourceColor } from "../palette";
import type { BeforeAfterView, FeaturedCluster } from "../worker/protocol";

const clip = (v: string, n = 28) => (v.length > n ? v.slice(0, n - 1) + "…" : v);

export default function BeforeAfter() {
  const st = useClient();
  const featured = useView<FeaturedCluster[]>({ type: "featured" }, [st.run]);
  const anchors = (featured.data ?? []).slice(0, 3).map((f) => f.anchor);
  const view = useView<BeforeAfterView>(anchors.length ? { type: "beforeAfter", records: anchors } : null);
  const [hover, setHover] = useState<number | null>(null);
  const order = st.overview?.sources.map((s) => s.id) ?? [];
  const label = new Map(st.overview?.sources.map((s) => [s.id, s]) ?? []);
  const v = view.data;
  if (!v) return <div className="spot-skeleton">Waiting for the pipeline…</div>;
  const goldenIds = [...new Set(v.after.rows.map((r) => r.golden))];
  const tone = (g: number) => goldenIds.indexOf(g);
  return (
    <div className="ba" onMouseLeave={() => setHover(null)}>
      <div className="ba-before">
        <h3 className="label">
          Before <span className="muted">{v.before.reduce((a, b) => a + b.rows.length, 0)} rows in three shapes</span>
        </h3>
        {v.before.map((b) => (
          <div key={b.source} className="ba-table" style={{ color: sourceColor(b.source, order) }}>
            <div className="ba-cap">
              <b>{label.get(b.source)?.label ?? b.source}</b> <span className="mono muted">{label.get(b.source)?.name}</span>
            </div>
            <div className="scroll-x" tabIndex={0} role="region" aria-label={`${label.get(b.source)?.label} rows`}>
              <table>
                <thead>
                  <tr>
                    {b.columns.map((c) => (
                      <th key={c}>{clip(c, 22)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r) => (
                    <tr key={r.rec} className={`tone-${tone(r.golden)} ${hover === r.golden ? "is-lit" : ""}`} onMouseEnter={() => setHover(r.golden)}>
                      {r.cells.map((c, i) => (
                        <td key={i} className="mono" title={c.length > 28 ? c : undefined}>
                          {c ? clip(c) : <span className="null">empty</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      <div className="ba-after">
        <h3 className="label">
          After <span className="muted">one row per customer, canonical columns</span>
        </h3>
        <div className="scroll-x" tabIndex={0} role="region" aria-label="Golden rows">
          <table className="gold-table">
            <thead>
              <tr>
                {v.after.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.after.rows.map((r) => (
                <tr key={r.golden} className={`tone-${tone(r.golden)} ${hover === r.golden ? "is-lit" : ""}`} onMouseEnter={() => setHover(r.golden)}>
                  {r.cells.map((c, i) => (
                    <td key={i} className="mono">
                      {c === null ? <span className="null">null</span> : typeof c === "number" ? c.toFixed(c % 1 ? 2 : 0) : clip(String(c), 34)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
