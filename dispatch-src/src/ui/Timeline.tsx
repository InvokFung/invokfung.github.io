// Each technician's day as a row: shift, overtime allowance, driving, work,
// waiting, and the booked window of every visit with a tight window. Moved
// jobs from the last re-plan are outlined; the line is the clock.

import { Fragment, useEffect, useRef } from "react";
import { client, useClient, useClock } from "../client";
import { SKILL_SHORT } from "../core/day";
import { hhmm } from "../format";
import { techColor } from "../palette";
import { scene } from "./scene";

const FROM = 7 * 60;
const TO = 19 * 60 + 30;
const x = (t: number) => `${(Math.max(0, Math.min(1, (t - FROM) / (TO - FROM))) * 100).toFixed(3)}%`;
const w = (a: number, b: number) => `${(Math.max(0, (Math.min(b, TO) - Math.max(a, FROM)) / (TO - FROM)) * 100).toFixed(3)}%`;

export default function Timeline() {
  const st = useClient();
  const ck = useClock();
  const snap = st.snap;
  // on a narrow screen the rows scroll sideways; keep the clock in view unless you just scrolled
  const scroller = useRef<HTMLDivElement>(null);
  const userAt = useRef(-1e9);
  const ours = useRef(false);
  const step = Math.floor(ck.t / 5);
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth + 1 || performance.now() - userAt.current < 6000) return;
    const label = (el.querySelector(".g-name") as HTMLElement | null)?.offsetWidth ?? 0;
    const frac = Math.max(0, Math.min(1, (step * 5 - FROM) / (TO - FROM)));
    const nowX = label + (el.scrollWidth - label) * frac;
    if (nowX < el.scrollLeft + label + 16 || nowX > el.scrollLeft + el.clientWidth - 40) {
      ours.current = true;
      el.scrollLeft = Math.max(0, nowX - label - 40);
    }
  }, [step]);
  const onScroll = () => {
    if (!ours.current) userAt.current = performance.now();
    ours.current = false;
  };
  if (!snap) return <div className="spot-skeleton">Planning the morning…</div>;
  const sc = scene(snap);
  const t = ck.t;
  const lit = st.lit !== null ? snap.log[st.lit] : null;
  const moved = new Set(lit && performance.now() - st.litAt < 15000 ? lit.moved.map((m) => m.job) : []);
  const hours = [8, 10, 12, 14, 16, 18];
  return (
    <div className="gantt">
      <div className="g-scroll" role="region" aria-label="Each technician's day" tabIndex={0} ref={scroller} onScroll={onScroll}>
      <div className="g-inner">
      <div className="g-head">
        <span className="g-name-h">Technician</span>
        <div className="g-scale">
          {hours.map((h) => (
            <span key={h} style={{ left: x(h * 60), visibility: h * 60 - t > -30 && h * 60 - t < 55 ? "hidden" : undefined }}>
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
      </div>
      <div className="g-body">
        {snap.techs.map((tech, k) => {
          const gone = tech.gone !== null;
          const vs = sc.visits[k];
          const ls = sc.legs[k];
          const left = vs.filter((v) => !v.abandoned && v.end > t).length;
          // waiting: from the end of one visit (or the shift start) to the next departure
          const idle: [number, number][] = [];
          let free = tech.start;
          for (const l of ls) {
            if (l.depart - free > 1) idle.push([free, l.depart]);
            const v = vs.find((q) => q.job === l.job && q.arrive >= l.depart - 1e-6);
            free = v ? v.end : (l.cut ?? l.arrive);
          }
          return (
            <div key={k} className={`g-row ${st.selectedTech === k ? "is-sel" : ""} ${gone ? "is-gone" : ""}`}>
              <button className="g-name" onClick={() => client.set({ selectedTech: st.selectedTech === k ? null : k, selectedJob: null })} title={`Select ${tech.name}`}>
                <i style={{ background: techColor(k) }} />
                <span className="g-who">{tech.name}</span>
                <span className="g-meta">{gone ? "home" : `${left} left`}</span>
              </button>
              <div className="g-track">
                <span className="g-shift" style={{ left: x(tech.start), width: w(tech.start, tech.end) }} />
                <span className="g-ot" style={{ left: x(tech.end), width: w(tech.end, tech.hardEnd) }} />
                {idle.map(([a, b], i) => (
                  <span key={`i${i}`} className="g-idle" style={{ left: x(a), width: w(a, b) }} />
                ))}
                {ls.map((l, i) => (
                  <span key={`l${i}`} className={`g-drive ${(l.cut ?? l.arrive) <= t ? "is-past" : ""}`} style={{ left: x(l.depart), width: w(l.depart, l.cut ?? l.arrive) }} />
                ))}
                {vs.map((v, i) => {
                  const j = snap.jobs[v.job];
                  const tight = j.kind === "slot" || j.kind === "urgent";
                  const cls = ["g-visit", v.end <= t ? "is-past" : v.start <= t ? "is-now" : "", v.late > 0.5 ? "is-late" : "", v.abandoned ? "is-abandoned" : "", moved.has(v.job) && !v.abandoned ? "is-moved" : "", st.selectedJob === v.job ? "is-sel" : ""].join(" ");
                  return (
                    <Fragment key={`v${i}`}>
                      {tight && !v.abandoned && <span className="g-window" style={{ left: x(j.e), width: w(j.e, j.l) }} />}
                      <button
                        className={cls}
                        style={{ left: x(v.start), width: w(v.start, Math.max(v.end, v.start + 4)), background: v.abandoned ? undefined : techColor(k) }}
                        title={`${j.label} ${j.task} · ${SKILL_SHORT[j.skill]} · window ${hhmm(j.e)}–${hhmm(j.l)} · ${hhmm(v.start)}–${hhmm(v.end)}${v.late > 0.5 ? ` · ${Math.round(v.late)} min late` : ""}${v.abandoned ? " · abandoned" : ""}`}
                        onClick={() => client.set({ selectedJob: st.selectedJob === v.job ? null : v.job })}
                      >
                        <span>{j.label}</span>
                      </button>
                    </Fragment>
                  );
                })}
                {gone && <span className="g-off" style={{ left: x(tech.gone!), width: w(tech.gone!, TO) }} />}
              </div>
            </div>
          );
        })}
        <span className="g-now" style={{ left: `calc(var(--g-label) + (100% - var(--g-label)) * ${(Math.max(0, Math.min(1, (t - FROM) / (TO - FROM)))).toFixed(4)})` }}>
          <b>{hhmm(t)}</b>
        </span>
      </div>
      </div>
      </div>
      <div className="g-legend small muted">
        <span>
          <i className="lg-visit" /> on site
        </span>
        <span>
          <i className="lg-drive" /> driving
        </span>
        <span>
          <i className="lg-idle" /> waiting
        </span>
        <span>
          <i className="lg-window" /> booked 2-hour window
        </span>
        <span>
          <i className="lg-ot" /> overtime allowance
        </span>
        <span>
          <i className="lg-late" /> late
        </span>
        <span>
          <i className="lg-moved" /> moved by the last re-plan
        </span>
      </div>
    </div>
  );
}
