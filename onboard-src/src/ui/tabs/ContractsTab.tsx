import { useState } from "react";
import { download, useClient, useView } from "../../client";
import { int, pct } from "../../format";
import { sourceColor, sourceShort } from "../../palette";
import type { ContractsView } from "../../worker/protocol";

export default function ContractsTab() {
  const st = useClient();
  const v = useView<ContractsView>({ type: "contracts" });
  const [open, setOpen] = useState<string | null>(null);
  const [yaml, setYaml] = useState(false);
  const order = st.overview?.sources.map((s) => s.id) ?? [];
  if (!v.data) return <div className="spot-skeleton">Checking…</div>;
  const d = v.data;
  return (
    <div className="tab-body">
      <p className="tab-intro">
        Rules a team would keep in its repository, checked on every run. Record rules run before matching; a record that fails a quarantine rule is held out of matching and the golden table. Cluster rules check that the sources agree about a customer; golden rules check the final table.
      </p>
      <div className="scroll-x" tabIndex={0} role="region" aria-label="Contract results">
        <table className="data contracts">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Scope</th>
              <th>On failure</th>
              <th className="num">Checked</th>
              <th className="num">Failed</th>
              <th>Pass rate</th>
            </tr>
          </thead>
          <tbody>
            {d.results.map((r) => {
              const rate = r.checked ? r.passed / r.checked : 1;
              return (
                <tr key={r.id} className={r.failed ? "has-fail" : ""}>
                  <td>
                    <button className="linkish mono strong" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} disabled={!r.samples.length}>
                      {r.id}
                    </button>
                    <div className="muted small">{r.description}</div>
                    {open === r.id && (
                      <ul className="samples">
                        {r.samples.map((s, i) => (
                          <li key={i} className="mono small">
                            <span className="muted">{s.label}</span> {s.value || "(empty)"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>{r.scope}</td>
                  <td>
                    <span className={`tag ${r.severity === "quarantine" ? "bad" : ""}`}>{r.severity}</span>
                  </td>
                  <td className="num mono">{int(r.checked)}</td>
                  <td className={`num mono ${r.failed ? "warn" : ""}`}>{int(r.failed)}</td>
                  <td>
                    <span className="passbar" style={{ ["--w" as string]: rate }} />
                    <span className="mono small">{pct(rate, rate === 1 ? 0 : 2)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h4 className="label">
        Quarantine <span className="muted">{int(st.overview?.totals.quarantined ?? d.quarantine.length)} records</span>
      </h4>
      <ul className="quarantine-list">
        {d.quarantine.map((q) => (
          <li key={q.rec}>
            <span className="src-chip" style={{ color: sourceColor(q.source, order) }}>
              {sourceShort(q.source)}
            </span>
            <span className="mono muted small">
              {q.source === "billing" ? "line" : "row"} {q.line}
            </span>
            <span className="tag bad">{q.reasons.join(", ")}</span>
            <span className="mono small clip">{q.preview}</span>
          </li>
        ))}
      </ul>
      <div className="export-row">
        <button className="btn ghost small" onClick={() => setYaml(!yaml)} aria-expanded={yaml}>
          {yaml ? "Hide" : "Show"} contracts YAML
        </button>
        <button className="btn small" onClick={() => download("onboard-contracts.yaml", "text/yaml", d.yaml + "\n")}>
          Download YAML
        </button>
      </div>
      {yaml && <pre className="code">{d.yaml}</pre>}
    </div>
  );
}
