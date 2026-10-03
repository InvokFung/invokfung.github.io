import type { Decision, RequestSummary } from "@relay/core";
import { fmtMs, fmtUsd, shortUp } from "../data";

const TENANT: Record<string, string> = { acme: "acme", globex: "globex", trial: "trial", sandbox: "sandbox" };

/** The decisions worth a chip: anything that was not routine. */
function chips(s: RequestSummary): Decision[] {
  return s.decisions.filter((d) => {
    if (d.stage === "auth" || d.stage === "limit") return d.tone !== "ok";
    if (d.stage === "redact") return d.label !== "no PII found" && !/^restored/.test(d.label);
    if (d.stage === "screen") return d.tone !== "ok";
    if (d.stage === "cache") return d.label !== "miss" && d.label !== "cache off";
    if (d.stage === "route") return false;
    if (d.stage === "meter") return d.tone === "bad";
    if (d.stage === "resilience") return !/^first token/.test(d.label);
    return false;
  });
}

function statusClass(s: RequestSummary): string {
  if (s.cache === "exact" || s.cache === "near") return "status hit";
  if (s.outcome === "ok") return "status";
  if (s.outcome === "cut" || s.status === 429 || s.status === 402) return "status warn";
  return "status bad";
}

export function Feed({ recent }: { recent: RequestSummary[] }) {
  const rows = recent.slice(0, 9);
  return (
    <div className="panel feed">
      <h2 className="panel-title">
        Recent requests <span className="hint">newest first</span>
      </h2>
      <ol aria-label="Recent requests through the gateway">
        {rows.map((s) => (
          <li key={s.id}>
            <span className={statusClass(s)}>{s.cache === "exact" || s.cache === "near" ? "HIT" : s.outcome === "cut" ? "CUT" : s.status}</span>
            <span className="what">
              {TENANT[s.tenant ?? ""] ?? "?"} · {s.model}
              {s.upstream ? ` → ${shortUp(s.upstream)}` : ""}
              {s.canary ? ` · ${s.configVersion}` : ""}
            </span>
            <span className="meta">
              {fmtMs(s.latencyMs)}
              {s.costUsd ? ` · ${fmtUsd(s.costUsd)}` : ""}
            </span>
            <span className="chips">
              {chips(s)
                .slice(0, 4)
                .map((d, i) => (
                  <span key={i} className={`chip ${d.tone}`}>
                    {d.label}
                  </span>
                ))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
