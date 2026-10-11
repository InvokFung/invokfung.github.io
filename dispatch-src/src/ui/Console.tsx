// The controls beside the map: the clock, the disruptions you can cause, and
// the log of re-plans with what moved.

import { useEffect, useState } from "react";
import { clock, client, DAY_TO, SPEEDS, useClient, useClock } from "../client";
import { SKILLS, type Skill } from "../core/day";
import { hhmm, ms, pct } from "../format";
import { techColor } from "../palette";
import { jobStatus, scene, techAt } from "./scene";

export function StatusStrip() {
  const st = useClient();
  const ck = useClock();
  const snap = st.snap;
  if (!snap || !st.init) return <div className="status-strip is-wait">Building the city and planning the morning in a Web Worker…</div>;
  const sc = scene(snap);
  let done = 0;
  let late = 0;
  let open = 0;
  let unassigned = 0;
  for (const j of snap.jobs) {
    const s = jobStatus(sc, j.id, ck.t);
    if (s === "hidden") continue;
    if (s === "done") done++;
    else if (s === "doneLate") {
      done++;
      late++;
    } else if (s === "unassigned") unassigned++;
    else open++;
  }
  const visible = snap.jobs.filter((j) => j.release <= ck.t).length;
  const p = snap.compare.dispatch;
  const last = snap.log[snap.log.length - 1];
  return (
    <div className="status-strip">
      <div className="ss-clock mono" aria-live="off">
        {hhmm(ck.t)}
      </div>
      <div className="ss-item">
        <span className="ss-k">Done</span>
        <b>
          {done}
          <span className="muted">/{visible}</span>
        </b>
      </div>
      <div className="ss-item">
        <span className="ss-k">Still to do</span>
        <b>{open}</b>
      </div>
      <div className="ss-item">
        <span className="ss-k">Late so far</span>
        <b className={late ? "bad" : ""}>{late}</b>
      </div>
      <div className="ss-item">
        <span className="ss-k">Unassigned</span>
        <b className={unassigned ? "warn" : ""}>{unassigned}</b>
      </div>
      <div className="ss-item ss-wide">
        <span className="ss-k">End of day, if nothing else happens</span>
        <b>
          {pct(p.onTimeRate)} on time
          <span className="muted">
            {" "}
            · {p.served}/{p.jobs} done
          </span>
        </b>
      </div>
      <div className="ss-item">
        <span className="ss-k">Last re-plan</span>
        <b className="ok mono">{last ? ms(last.ms) : "–"}</b>
      </div>
    </div>
  );
}

export function Controls() {
  const st = useClient();
  const ck = useClock();
  const over = ck.t >= DAY_TO;
  return (
    <div className="card ctl">
      <div className="ctl-row">
        {over ? (
          <button className="btn" onClick={() => void client.reset()}>
            Replay the day
          </button>
        ) : (
          <button className="btn" onClick={() => clock.toggle()} disabled={st.phase !== "ready"} aria-pressed={ck.playing}>
            {ck.playing ? "Pause" : "Play"}
          </button>
        )}
        <div className="seg small" role="group" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button key={s} className={ck.speed === s ? "is-on" : ""} onClick={() => clock.setSpeed(s)}>
              {s} min/s
            </button>
          ))}
        </div>
        <button className="btn ghost small" onClick={() => void client.reset()} disabled={st.phase !== "ready"}>
          Reset
        </button>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={st.scripted} onChange={(e) => void client.reset(e.target.checked)} disabled={st.phase !== "ready"} />
        Scripted disruptions (the sick call at 09:00 and the rest of the evaluated script)
      </label>
    </div>
  );
}

export function Disrupt() {
  const st = useClient();
  const ck = useClock();
  const snap = st.snap;
  const [factor, setFactor] = useState(1);
  useEffect(() => {
    if (snap) setFactor(snap.factor);
  }, [snap?.factor, snap]);
  if (!snap || !st.init) return null;
  const sc = scene(snap);
  const city = st.init.city;
  const sel = st.selectedTech;
  const tech = sel !== null ? snap.techs[sel] : null;
  const pos = sel !== null ? techAt(sc, city, sel, ck.t) : null;
  const onSite = snap.techs.map((_, k) => techAt(sc, city, k, ck.t)).map((p, k) => ({ p, k })).filter((x) => x.p.state === "onsite");
  const overrunTech = pos?.state === "onsite" ? sel : (onSite[0]?.k ?? null);
  const ended = ck.t >= DAY_TO - 60;
  const busy = st.busy || st.phase !== "ready" || ended;
  const job = st.selectedJob !== null ? snap.jobs[st.selectedJob] : null;
  const jv = job ? sc.visitOf.get(job.id) : null;
  const stateText = (s: string) => ({ driving: "driving", onsite: "on a job", idle: "waiting", depot: "at the depot", off: "not on shift yet", gone: "gone home" })[s] ?? s;
  return (
    <div className="card disrupt">
      <h3 className="label">Cause a disruption</h3>
      <div className="d-block">
        {tech && pos ? (
          <>
            <p className="d-sel">
              <i style={{ background: techColor(sel!) }} />
              <b>{tech.name}</b> <span className="muted">{SKILLS.filter((_, i) => tech.skills & (1 << i)).join(", ")}</span>
              <br />
              <span className="small muted">
                Shift {hhmm(tech.start)}–{hhmm(tech.end)}, now {stateText(pos.state)}
                {pos.job >= 0 ? ` (${snap.jobs[pos.job].label})` : ""}
              </span>
            </p>
            <button className="btn no" disabled={busy || tech.gone !== null} onClick={() => void client.event({ kind: "sick", tech: sel! })}>
              {tech.gone !== null ? `${tech.name} went home at ${hhmm(tech.gone)}` : `Send ${tech.name} home`}
            </button>
          </>
        ) : (
          <p className="small muted">Click a technician on the map or a name on the timeline to select them, then send them home.</p>
        )}
      </div>
      <div className="d-block">
        <button className="btn ghost" disabled={busy || overrunTech === null} onClick={() => overrunTech !== null && void client.event({ kind: "overrun", tech: overrunTech, extra: 45 })}>
          {overrunTech === null ? "Overrun: nobody is on a job" : `${snap.techs[overrunTech].name}'s job overruns 45 min`}
        </button>
      </div>
      <div className="d-block">
        <label className="d-label" htmlFor="skill">
          Click the map to drop an urgent job needing
        </label>
        <select id="skill" value={st.urgentSkill} onChange={(e) => client.set({ urgentSkill: Number(e.target.value) as Skill })}>
          {SKILLS.map((s, i) => (
            <option key={s} value={i}>
              {s}
            </option>
          ))}
        </select>
        <span className="small muted"> · must start within 2 h</span>
      </div>
      <div className="d-block slider">
        <label htmlFor="traffic">
          Traffic on top of rush hour: <b>{factor.toFixed(1)}×</b>
        </label>
        <input
          id="traffic"
          type="range"
          min={1}
          max={2}
          step={0.1}
          value={factor}
          disabled={busy}
          onChange={(e) => setFactor(Number(e.target.value))}
          onPointerUp={() => factor !== snap.factor && void client.event({ kind: "traffic", factor })}
          onKeyUp={() => factor !== snap.factor && void client.event({ kind: "traffic", factor })}
        />
      </div>
      {st.notice && <p className="small warn">{st.notice}</p>}
      {job && (
        <div className="d-job small">
          <b>{job.label}</b> {job.task} · {SKILLS[job.skill]} · {job.dur} min · window {hhmm(job.e)}–{hhmm(job.l)}
          {jv ? (
            <>
              {" "}
              · {snap.techs[jv.tech].name}, {hhmm(jv.start)}
              {jv.late > 0.5 ? <span className="bad"> ({Math.round(jv.late)} min late)</span> : null}
            </>
          ) : (
            <span className="warn"> · unassigned</span>
          )}
        </div>
      )}
    </div>
  );
}

export function ReplanLog() {
  const st = useClient();
  const snap = st.snap;
  if (!snap) return null;
  const entries = snap.log.map((l, i) => ({ l, i })).reverse();
  const name = (k: number) => (k === -1 ? "nobody" : k === -2 ? "new" : snap.techs[k].name);
  return (
    <div className="card log">
      <h3 className="label">
        Re-plans <span className="muted">each one freezes what is under way and re-optimises the rest</span>
      </h3>
      {entries.length === 0 ? (
        <p className="small muted">Nothing has gone wrong yet. {st.scripted ? "The first scripted event is a sick call at 09:00." : "Cause a disruption to see a re-plan."}</p>
      ) : (
        <ol className="log-list">
          {entries.map(({ l, i }) => {
            const realMoves = l.moved.filter((m) => m.to !== m.from);
            const lit = st.lit === i;
            return (
              <li key={i} className={lit ? "is-lit" : ""}>
                <button className="log-head" onClick={() => client.set({ lit: i, litAt: performance.now() })} title="Light up the jobs this re-plan moved">
                  <span className="mono log-at">{hhmm(l.at)}</span>
                  <span className="log-text">
                    {l.text}
                    {l.user && <span className="tag">you</span>}
                  </span>
                  <span className="mono log-ms">{ms(l.ms)}</span>
                </button>
                <div className="log-sub small muted">
                  {l.jobsInPlay} jobs re-planned{l.iterations ? `, ${l.iterations} ALNS iterations` : ""}
                  {l.hitDeadline ? ", stopped at the 50 ms budget" : ""} · {realMoves.length === 0 ? "nothing moved" : `${realMoves.length} moved`}
                </div>
                {realMoves.length > 0 && (
                  <ul className="moves">
                    {realMoves.slice(0, lit ? 40 : 6).map((m) => (
                      <li key={m.job}>
                        <b>{snap.jobs[m.job].label}</b> {name(m.from)} → <span style={{ color: m.to >= 0 ? techColor(m.to) : "var(--warn)" }}>{name(m.to)}</span>
                      </li>
                    ))}
                    {!lit && realMoves.length > 6 && <li className="muted">+{realMoves.length - 6} more</li>}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
