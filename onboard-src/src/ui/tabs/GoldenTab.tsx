import { useDeferredValue, useState } from "react";
import { client, download, useClient, useView } from "../../client";
import { int } from "../../format";
import type { GoldenTableView } from "../../worker/protocol";

const PAGE = 25;

export default function GoldenTab() {
  const st = useClient();
  const [q, setQ] = useState("");
  const query = useDeferredValue(q);
  const [page, setPage] = useState(0);
  const v = useView<GoldenTableView>({ type: "golden", offset: page * PAGE, limit: PAGE, query });
  const [exporting, setExporting] = useState(false);
  const d = v.data;
  const pages = d ? Math.max(1, Math.ceil(d.matching / PAGE)) : 1;
  const policy = st.overview?.policy;
  return (
    <div className="tab-body">
      <p className="tab-intro">
        The output: one row per customer in the canonical schema, each value chosen by its survivorship rule. The CSV export applies the PII policy on the way out (now: email {policy?.email}, phone {policy?.phone}, birth date {policy?.dob}).
      </p>
      <div className="golden-tools">
        <input
          type="search"
          placeholder="Filter rows"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          aria-label="Filter golden rows"
        />
        <span className="muted small">{d ? `${int(d.matching)} of ${int(d.total)} customers` : ""}</span>
        <button
          className="btn small"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              const f = await client.call<{ name: string; mime: string; text: string }>({ type: "export", what: "golden-csv" });
              download(f.name, f.mime, f.text);
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? "Preparing…" : "Download golden CSV"}
        </button>
      </div>
      {d && (
        <>
          <div className="scroll-x" tabIndex={0} role="region" aria-label="Golden table">
            <table className="data golden-data">
              <thead>
                <tr>
                  {d.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.index}>
                    {r.values.map((x, i) => (
                      <td key={i} className="mono">
                        {x === null ? <span className="null">null</span> : typeof x === "number" ? (Number.isInteger(x) ? x : x.toFixed(2)) : String(x)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <button className="btn ghost small" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span className="mono small">
              page {page + 1} of {int(pages)}
            </span>
            <button className="btn ghost small" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
