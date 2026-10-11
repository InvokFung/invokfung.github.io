// The same day and the same disruptions, played three ways: Dispatch, the
// morning plan kept as it was, and a greedy dispatcher. Each card is the end
// of the day as projected from the events so far.

import { useClient } from "../client";
import type { Outcome } from "../core/metrics";
import { int, pct } from "../format";

const CARDS: { key: "dispatch" | "keep" | "greedy"; title: string; how: string }[] = [
  { key: "dispatch", title: "Dispatch", how: "Re-plans the rest of the day at every event: freeze what is under way, repair, then search for up to 50 ms." },
  { key: "keep", title: "Keep the morning plan", how: "No re-planning. An absent technician's jobs and new urgent jobs go to the end of the day of whoever finishes first." },
  { key: "greedy", title: "Greedy dispatcher", how: "No plan. Each free technician takes the nearest waiting job they are qualified for, urgent jobs first." },
];

function Row({ k, v, cls = "" }: { k: string; v: string; cls?: string }) {
  return (
    <div className="cmp-row">
      <dt>{k}</dt>
      <dd className={`mono ${cls}`}>{v}</dd>
    </div>
  );
}

export default function Compare() {
  const st = useClient();
  const snap = st.snap;
  if (!snap) return <div className="spot-skeleton">Planning the morning…</div>;
  const best = (f: (o: Outcome) => number, lowIsGood: boolean) => {
    const vals = CARDS.map((c) => f(snap.compare[c.key]));
    return lowIsGood ? Math.min(...vals) : Math.max(...vals);
  };
  const bestOnTime = best((o) => o.onTimeRate, false);
  const bestLate = best((o) => o.weightedLate, true);
  return (
    <div className="compare">
      {CARDS.map((c) => {
        const o = snap.compare[c.key];
        return (
          <article key={c.key} className={`card cmp ${c.key === "dispatch" ? "is-main" : ""}`}>
            <h3>{c.title}</h3>
            <p className="small muted">{c.how}</p>
            <div className={`cmp-big mono ${o.onTimeRate === bestOnTime ? "ok" : ""}`}>{pct(o.onTimeRate)}</div>
            <div className="small muted cmp-sub">of visits on time</div>
            <dl>
              <Row k="Visits done" v={`${o.served} of ${o.jobs}`} cls={o.missed ? "warn" : ""} />
              <Row k="Late visits" v={o.lateJobs ? `${o.lateJobs}, ${int(o.lateMin)} min in all` : "none"} cls={o.lateJobs ? "bad" : ""} />
              <Row k="Priority-weighted lateness" v={`${int(o.weightedLate)}`} cls={o.weightedLate === bestLate ? "ok" : ""} />
              <Row k="Urgent jobs on time" v={o.urgent ? `${o.urgentOnTime} of ${o.urgent}` : "none yet"} />
              <Row k="Driving" v={`${int(o.driveMin)} min`} />
              <Row k="Overtime" v={`${int(o.overtimeMin)} min`} />
            </dl>
          </article>
        );
      })}
    </div>
  );
}
