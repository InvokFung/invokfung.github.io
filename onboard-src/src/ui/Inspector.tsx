// Every stage's own view, one tab each, each loaded on first open.

import { lazy, Suspense, useEffect, useState } from "react";
import { useClient } from "../client";
import { int } from "../format";

const TABS = [
  { key: "profile", label: "Profile", C: lazy(() => import("./tabs/ProfileTab")) },
  { key: "pii", label: "PII", C: lazy(() => import("./tabs/PiiTab")) },
  { key: "mapping", label: "Mapping", C: lazy(() => import("./tabs/MappingTab")) },
  { key: "review", label: "Review queue", C: lazy(() => import("./tabs/ReviewTab")) },
  { key: "model", label: "Matching model", C: lazy(() => import("./tabs/ModelTab")) },
  { key: "contracts", label: "Contracts", C: lazy(() => import("./tabs/ContractsTab")) },
  { key: "golden", label: "Golden table", C: lazy(() => import("./tabs/GoldenTab")) },
  { key: "sql", label: "SQL", C: lazy(() => import("./tabs/SqlTab")) },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Inspector() {
  const st = useClient();
  const [tab, setTab] = useState<TabKey>(() => {
    try {
      const saved = localStorage.getItem("onboard.tab");
      if (saved && TABS.some((t) => t.key === saved)) return saved as TabKey;
    } catch {
      /* storage blocked */
    }
    return "review";
  });
  useEffect(() => {
    try {
      localStorage.setItem("onboard.tab", tab);
    } catch {
      /* storage blocked */
    }
  }, [tab]);
  const badge = (k: TabKey) => {
    const o = st.overview;
    if (!o) return null;
    if (k === "review") return o.totals.review;
    if (k === "contracts") return o.totals.quarantined;
    if (k === "golden") return o.totals.golden;
    return null;
  };
  const Active = TABS.find((t) => t.key === tab)!.C;
  const onKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.key === tab);
    if (e.key === "ArrowRight") setTab(TABS[(i + 1) % TABS.length].key);
    else if (e.key === "ArrowLeft") setTab(TABS[(i - 1 + TABS.length) % TABS.length].key);
    else return;
    e.preventDefault();
    requestAnimationFrame(() => document.getElementById(`tab-${TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].key}`)?.focus());
  };
  return (
    <div className="inspector">
      <div className="tabs" role="tablist" aria-label="Pipeline stages" onKeyDown={onKey}>
        {TABS.map((t) => {
          const b = badge(t.key);
          return (
            <button key={t.key} id={`tab-${t.key}`} role="tab" aria-selected={tab === t.key} aria-controls="tabpanel" tabIndex={tab === t.key ? 0 : -1} className={`tab ${tab === t.key ? "is-on" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}
              {b !== null && <span className="tab-badge mono">{int(b)}</span>}
            </button>
          );
        })}
      </div>
      <div className="tabpanel" id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {st.phase !== "ready" ? (
          <div className="spot-skeleton">Waiting for the pipeline…</div>
        ) : (
          <Suspense fallback={<div className="spot-skeleton">Loading…</div>}>
            <Active />
          </Suspense>
        )}
      </div>
    </div>
  );
}
