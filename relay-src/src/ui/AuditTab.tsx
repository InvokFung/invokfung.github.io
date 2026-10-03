// The audit log as the gateway wrote it: redacted prompts and responses, one
// record per request, each hashed together with the previous record's hash.

import { useState } from "react";
import type { LiveEngine } from "../live/engine";
import { fmtUsd } from "../data";

const MARK_RE = /(<(?:EMAIL|PHONE|CARD|IBAN|NAME)_\d+>|\[(?:EMAIL|PHONE|CARD|IBAN|NAME)\])/g;

function marked(text: string) {
  return text.split(MARK_RE).map((part, i) =>
    i % 2 ? (
      <span className="ph" key={i}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function AuditTab({ engine }: { engine: LiveEngine }) {
  const [check, setCheck] = useState<{ ok: boolean; checked: number; ms: number } | null>(null);
  const recs = engine.gw.audit.list({ limit: 8 }).reverse();
  return (
    <div className="panel pane">
      <h4>
        Audit log <span>{engine.gw.audit.size} records held · newest first</span>
      </h4>
      <p className="keynote" style={{ margin: "0 0 10px" }}>
        Prompts and responses are stored redacted, whatever the tenant's redaction mode; originals never reach the log. Each record's SHA-256 covers its body and the previous record's hash, so an edited or deleted record breaks the chain where it was.{" "}
        <button
          type="button"
          className="btn small"
          onClick={() => {
            const t0 = performance.now();
            const r = engine.gw.audit.verify();
            setCheck({ ok: r.ok, checked: r.checked, ms: performance.now() - t0 });
          }}
        >
          Verify chain
        </button>{" "}
        {check ? (
          <span className={check.ok ? "tone-ok" : "tone-bad"}>
            {check.ok ? "intact" : "broken"}: {check.checked} records re-hashed in {check.ms.toFixed(1)} ms
          </span>
        ) : null}
      </p>
      <div className="tbl-wrap">
        <table className="data audit">
          <thead>
            <tr>
              <th>#</th>
              <th>Prompt (as stored)</th>
              <th>Tenant</th>
              <th>Status</th>
              <th>Cost</th>
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {recs.map((r) => (
              <tr key={r.seq}>
                <td>{r.seq}</td>
                <td className="prompt">{marked(r.prompt)}</td>
                <td>{r.tenant ?? "–"}</td>
                <td>
                  {r.status} {r.cache === "exact" || r.cache === "near" ? "hit" : r.outcome}
                </td>
                <td>{fmtUsd(r.usage.costUsd)}</td>
                <td title={`prev ${r.prev}`}>{r.hash.slice(0, 10)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
