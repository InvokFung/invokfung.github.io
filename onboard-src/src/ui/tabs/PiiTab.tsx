import { useState } from "react";
import { client, useClient, useView } from "../../client";
import { PII_LABEL, PII_TYPES, type PiiAction, type PiiPolicy } from "../../core/pii";
import { int, pct } from "../../format";
import { sourceColor, sourceShort } from "../../palette";
import type { PiiView } from "../../worker/protocol";
import { Segments } from "../Segments";

const ACTIONS: { key: PiiAction; label: string }[] = [
  { key: "mask", label: "mask" },
  { key: "token", label: "token" },
  { key: "keep", label: "keep" },
];

export default function PiiTab() {
  const st = useClient();
  const v = useView<PiiView>({ type: "pii" });
  const [key, setKey] = useState("onboard-demo-key");
  const [busy, setBusy] = useState(false);
  const order = st.overview?.sources.map((s) => s.id) ?? [];
  if (!v.data) return <div className="spot-skeleton">Scanning…</div>;
  const d = v.data;
  const apply = async (policy: PiiPolicy, k?: string) => {
    setBusy(true);
    try {
      await client.touch({ type: "policy", policy, key: k });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="tab-body">
      <p className="tab-intro">
        Every cell is scanned, and a pattern match counts only once it passes a check: card numbers need a valid Luhn digit and a real network prefix, IBANs a valid mod-97 checksum and their country&rsquo;s length, birth dates a word like &ldquo;DOB&rdquo; or &ldquo;born&rdquo; nearby. Tokens are HMAC-SHA256 of the value under a key, computed with WebCrypto, so one email has one token in every source.
      </p>
      <div className="pii-grid">
        <div className="card">
          <h4 className="label">Policy</h4>
          <table className="policy">
            <tbody>
              {PII_TYPES.map((t) => (
                <tr key={t}>
                  <th>
                    <mark className={`pii pii-${t}`}>{PII_LABEL[t]}</mark>
                  </th>
                  <td className="num mono">{int(d.byType[t])}</td>
                  <td>
                    <div className="seg small" role="radiogroup" aria-label={`${PII_LABEL[t]} policy`}>
                      {ACTIONS.map((a) => (
                        <button key={a.key} role="radio" aria-checked={d.policy[t] === a.key} className={d.policy[t] === a.key ? "is-on" : ""} disabled={busy} onClick={() => void apply({ ...d.policy, [t]: a.key })}>
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form
            className="rekey"
            onSubmit={(e) => {
              e.preventDefault();
              void apply(d.policy, key || "onboard-demo-key");
            }}
          >
            <label htmlFor="pii-key">Token key</label>
            <input id="pii-key" className="mono" value={key} onChange={(e) => setKey(e.target.value)} spellCheck={false} />
            <button className="btn small" disabled={busy}>
              Re-key
            </button>
          </form>
          <p className="muted small">{int(d.tokens)} distinct values tokenized in free-text columns. The golden CSV export applies the same policy to the email, phone and birth-date columns.</p>
        </div>
        {d.score && (
          <div className="card">
            <h4 className="label">Against the generator&rsquo;s truth</h4>
            <table className="mini">
              <thead>
                <tr>
                  <th />
                  <th className="num">Precision</th>
                  <th className="num">Recall</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>With checks</th>
                  <td className="num mono strong">{pct(d.score.precision)}</td>
                  <td className="num mono strong">{pct(d.score.recall)}</td>
                </tr>
                <tr>
                  <th>Regex only</th>
                  <td className="num mono">{pct(d.score.regexPrecision)}</td>
                  <td className="num mono">{pct(d.score.regexRecall)}</td>
                </tr>
              </tbody>
            </table>
            <p className="muted small">Scored on the free-text columns where the generator planted PII next to look-alikes: order numbers, invoice references, Luhn-invalid card numbers, dates that are not birth dates.</p>
          </div>
        )}
        <div className="card">
          <h4 className="label">Columns holding PII</h4>
          <ul className="pii-cols">
            {d.columns.map((c) => (
              <li key={`${c.source}:${c.column}`}>
                <span className="dot" style={{ background: sourceColor(c.source, order) }} />
                <span className="mono">{c.column}</span>
                <span className="muted">
                  {int(c.cells)} cells · {Object.entries(c.byType).map(([t, n]) => `${n} ${t}`).join(", ")}
                  {c.embedded ? " · inside free text" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <h4 className="label">Free text after the policy</h4>
      <ul className="pii-samples">
        {d.samples.map((s) => (
          <li key={`${s.source}:${s.row}:${s.column}`}>
            <span className="src-chip" style={{ color: sourceColor(s.source, order) }}>
              {sourceShort(s.source)}
            </span>
            <span className="muted mono small">
              {s.column}, row {int(s.row + 1)}
            </span>
            <p className="mono">
              <Segments segs={s.segments} />
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
