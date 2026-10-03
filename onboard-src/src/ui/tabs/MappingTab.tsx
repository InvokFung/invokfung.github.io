import { useState } from "react";
import { client, download, useClient, useView } from "../../client";
import type { FieldKey } from "../../core/schema";
import { pct } from "../../format";
import { sourceColor } from "../../palette";
import type { MappingView } from "../../worker/protocol";

export default function MappingTab() {
  const st = useClient();
  const v = useView<MappingView>({ type: "mapping" });
  const [src, setSrc] = useState(0);
  const [show, setShow] = useState<"yaml" | "sql" | null>(null);
  const order = st.overview?.sources.map((s) => s.id) ?? [];
  if (!v.data) return <div className="spot-skeleton">Mapping…</div>;
  const d = v.data;
  const s = d.sources[Math.min(src, d.sources.length - 1)];
  const label = new Map(d.fields.map((f) => [f.key, f.label]));
  return (
    <div className="tab-body">
      <p className="tab-intro">
        Each column is scored against the 17 canonical fields twice: on its header&rsquo;s words (&ldquo;Zip/Postcode&rdquo;, &ldquo;email_addr&rdquo;) and on what its values look like. A one-to-one assignment (Hungarian algorithm) then picks at most one column per field, with &ldquo;unmapped&rdquo; as an option for every column. Change any mapping and everything downstream re-runs.
        {d.accuracy !== null && (
          <>
            {" "}
            Against the generator&rsquo;s truth: <b>{pct(d.accuracy)}</b> of columns correct right now.
          </>
        )}
      </p>
      <div className="seg" role="tablist" aria-label="Source">
        {d.sources.map((x, i) => (
          <button key={x.id} role="tab" aria-selected={i === src} className={i === src ? "is-on" : ""} onClick={() => setSrc(i)} style={{ color: sourceColor(x.id, order) }}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="scroll-x" tabIndex={0} role="region" aria-label="Column mapping">
        <table className="data mapping">
          <thead>
            <tr>
              <th>Column</th>
              <th>Sample values</th>
              <th>Maps to</th>
              <th className="num">Confidence</th>
              <th className="num">Header · values</th>
              {d.accuracy !== null && <th>Truth</th>}
            </tr>
          </thead>
          <tbody>
            {s.columns.map((c) => {
              const ok = c.truth === undefined ? null : c.truth === c.field;
              return (
                <tr key={c.column} className={c.overridden ? "is-override" : ""}>
                  <td className="mono strong">{c.column}</td>
                  <td className="mono clip muted">{c.sample.join(" · ")}</td>
                  <td>
                    <select
                      aria-label={`Field for ${c.column}`}
                      value={c.field ?? ""}
                      disabled={st.busy}
                      onChange={(e) => void client.mutate({ type: "setMapping", source: s.id, column: c.column, field: (e.target.value || null) as FieldKey | null })}
                    >
                      <option value="">unmapped</option>
                      {d.fields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    {c.overridden && <span className="tag">override</span>}
                  </td>
                  <td className="num">
                    {c.field ? (
                      <>
                        <span className="minibar" style={{ ["--w" as string]: c.confidence }} />
                        <span className="mono">{c.confidence.toFixed(2)}</span>
                      </>
                    ) : (
                      <span className="muted small" title={c.candidates.map((x) => `${label.get(x.field)} ${x.score.toFixed(2)}`).join(", ")}>
                        best {label.get(c.candidates[0]?.field)} {c.candidates[0]?.score.toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className="num mono muted">
                    {c.name.toFixed(2)} · {c.value.toFixed(2)}
                  </td>
                  {d.accuracy !== null && <td className={ok ? "ok" : "bad"}>{ok ? "correct" : `should be ${c.truth ? label.get(c.truth) : "unmapped"}`}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="export-row">
        <button className="btn ghost small" onClick={() => setShow(show === "yaml" ? null : "yaml")} aria-expanded={show === "yaml"}>
          {show === "yaml" ? "Hide" : "Show"} mapping YAML
        </button>
        <button className="btn ghost small" onClick={() => setShow(show === "sql" ? null : "sql")} aria-expanded={show === "sql"}>
          {show === "sql" ? "Hide" : "Show"} SQL views
        </button>
        <button className="btn small" onClick={() => download("onboard-mapping.yaml", "text/yaml", d.yaml)}>
          Download YAML
        </button>
        <button className="btn small" onClick={() => download("onboard-staging-views.sql", "text/plain", d.sql)}>
          Download SQL
        </button>
      </div>
      {show && <pre className="code">{show === "yaml" ? d.yaml : d.sql}</pre>}
    </div>
  );
}
