import { useCallback, useEffect, useState } from "react";
import { client, useClient, useView } from "../../client";
import { int, ms } from "../../format";
import type { SqlSchema, SqlView } from "../../worker/protocol";

const EXAMPLES = [
  { label: "Customers by country", sql: "SELECT country, COUNT(*) AS customers, ROUND(AVG(balance_eur), 2) AS avg_balance\nFROM customers\nGROUP BY country\nORDER BY customers DESC" },
  { label: "Seen in all three systems", sql: "SELECT golden_id, first_name, last_name, records\nFROM customers\nWHERE sources = 'crm+billing+support'\nORDER BY records DESC, last_name\nLIMIT 20" },
  { label: "Pairs by decision", sql: "SELECT status, COUNT(*) AS pairs, ROUND(MIN(probability), 4) AS lowest, ROUND(MAX(probability), 4) AS highest\nFROM pairs\nGROUP BY status\nORDER BY pairs DESC" },
  { label: "Records per customer", sql: "SELECT records, COUNT(*) AS customers\nFROM customers\nGROUP BY records\nORDER BY records" },
  { label: "Quarantined records", sql: "SELECT source, line, first_name, last_name, quarantined\nFROM records\nWHERE quarantined IS NOT NULL\nORDER BY source, line" },
  { label: "Biggest balances", sql: "SELECT golden_id, first_name || ' ' || last_name AS name, company, balance_eur\nFROM customers\nWHERE balance_eur IS NOT NULL\nORDER BY balance_eur DESC\nLIMIT 10" },
];

export default function SqlTab() {
  const st = useClient();
  const schema = useView<SqlSchema>({ type: "sqlSchema" });
  const [text, setText] = useState(EXAMPLES[0].sql);
  const [res, setRes] = useState<SqlView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const run = useCallback(
    async (sql = text) => {
      setRunning(true);
      try {
        setRes(await client.call<SqlView>({ type: "sql", query: sql }));
        setErr(null);
      } catch (e) {
        setErr((e as Error).message);
        setRes(null);
      } finally {
        setRunning(false);
      }
    },
    [text],
  );
  // results follow the data: re-run after a decision, mapping or threshold change
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.version]);
  return (
    <div className="tab-body">
      <p className="tab-intro">
        A small SQL engine written for this page (tokenizer, recursive-descent parser, executor): <code>SELECT</code>, <code>WHERE</code>, <code>GROUP BY</code>, <code>HAVING</code>, <code>ORDER BY</code>, <code>LIMIT</code>, aggregates, <code>CASE</code>, <code>LIKE</code>, <code>IN</code>, <code>BETWEEN</code>. It reads the session&rsquo;s live tables, so a review decision changes the answer. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> runs.
      </p>
      <div className="sql-grid">
        <div>
          <div className="chips small">
            {EXAMPLES.map((e) => (
              <button
                key={e.label}
                className="chip"
                onClick={() => {
                  setText(e.sql);
                  void run(e.sql);
                }}
              >
                {e.label}
              </button>
            ))}
          </div>
          <textarea
            className="sql-input mono"
            value={text}
            spellCheck={false}
            aria-label="SQL query"
            rows={6}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void run();
              }
            }}
          />
          <div className="export-row">
            <button className="btn small" onClick={() => void run()} disabled={running}>
              Run
            </button>
            {res && (
              <span className="muted small mono">
                {int(res.total)} row{res.total === 1 ? "" : "s"}
                {res.total > res.rows.length ? `, first ${res.rows.length} shown` : ""} · {int(res.scanned)} scanned · {ms(res.ms)}
              </span>
            )}
          </div>
          {err && <p className="sql-err mono">{err}</p>}
        </div>
        <aside className="schema">
          <h4 className="label">Tables</h4>
          {schema.data?.tables.map((t) => (
            <details key={t.name}>
              <summary>
                <b className="mono">{t.name}</b> <span className="muted small">{int(t.rows)} rows</span>
              </summary>
              <p className="muted small">{t.description}</p>
              <p className="mono small cols">{t.columns.join(", ")}</p>
            </details>
          ))}
        </aside>
      </div>
      {res && (
        <div className="scroll-x" tabIndex={0} role="region" aria-label="Query result">
          <table className="data">
            <thead>
              <tr>
                {res.columns.map((c, i) => (
                  <th key={i}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {res.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((x, j) => (
                    <td key={j} className="mono">
                      {x === null ? <span className="null">null</span> : typeof x === "number" ? (Number.isInteger(x) ? int(x) : x.toFixed(4).replace(/0+$/, "")) : String(x)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
