import { useState } from "react";
import { useClient, useView } from "../../client";
import { FIELD } from "../../core/schema";
import { int, pct } from "../../format";
import { sourceColor } from "../../palette";
import type { ProfileView } from "../../worker/protocol";

export default function ProfileTab() {
  const st = useClient();
  const v = useView<ProfileView[]>({ type: "profile" });
  const [src, setSrc] = useState(0);
  const order = st.overview?.sources.map((s) => s.id) ?? [];
  if (!v.data) return <div className="spot-skeleton">Profiling…</div>;
  const p = v.data[Math.min(src, v.data.length - 1)];
  const meta = st.overview?.sources.find((s) => s.id === p.source);
  return (
    <div className="tab-body">
      <p className="tab-intro">
        What each column holds before anything is changed: the type most of its values parse as, how many are empty or null tokens (<code>N/A</code>, <code>-</code>, <code>null</code>), format masks, and the distinct count twice, exactly and by HyperLogLog with 4,096 registers, so the estimate&rsquo;s error is visible.
      </p>
      <div className="seg" role="tablist" aria-label="Source">
        {v.data.map((x, i) => (
          <button key={x.source} role="tab" aria-selected={i === src} className={i === src ? "is-on" : ""} onClick={() => setSrc(i)} style={{ color: sourceColor(x.source, order) }}>
            {x.label}
          </button>
        ))}
      </div>
      {meta && (
        <p className="muted small mono">
          {meta.name} · {meta.format.toUpperCase()}
          {meta.delimiter ? ` · delimiter "${meta.delimiter === "\t" ? "\\t" : meta.delimiter}"` : ""}
          {meta.bom ? " · UTF-8 BOM" : ""}
          {meta.lineEnding ? ` · ${meta.lineEnding}` : ""}
          {meta.nested ? ` · ${meta.nested} nested paths flattened` : ""}
          {meta.ragged ? ` · ${meta.ragged} ragged rows` : ""} · {int(meta.rows)} rows
        </p>
      )}
      <div className="scroll-x" tabIndex={0} role="region" aria-label="Column profiles">
        <table className="data">
          <thead>
            <tr>
              <th>Column</th>
              <th>Type</th>
              <th className="num">Filled</th>
              <th className="num">Distinct</th>
              <th className="num">HLL</th>
              <th>Most common</th>
              <th>Formats</th>
              <th>Mapped to</th>
            </tr>
          </thead>
          <tbody>
            {p.columns.map((c) => {
              const filled = (c.rows - c.nulls) / Math.max(1, c.rows);
              return (
                <tr key={c.index}>
                  <td className="mono strong">{c.name}</td>
                  <td>
                    {c.type} <span className="muted">{pct(c.typeShare, 0)}</span>
                  </td>
                  <td className="num">
                    <span className="minibar" style={{ ["--w" as string]: filled }} />
                    {pct(filled, 0)}
                    {c.nullTokens > 0 && <span className="muted"> ({int(c.nullTokens)} null tokens)</span>}
                  </td>
                  <td className="num mono">{int(c.distinct)}</td>
                  <td className="num mono">
                    {int(c.distinctHll)} <span className={Math.abs(c.hllError) > 0.02 ? "warn" : "muted"}>{(c.hllError >= 0 ? "+" : "") + pct(c.hllError)}</span>
                  </td>
                  <td className="mono clip">{c.top.map((t) => `${t.value || "∅"} ×${t.count}`).join(" · ")}</td>
                  <td className="mono clip">{c.masks.map((m) => m.mask).join("  ")}</td>
                  <td>{c.field ? FIELD[c.field].label : <span className="muted">unmapped</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
