import type { Candidate } from "../core/rca";
import { serviceDef } from "../core/topology";
import { PAGE_RULES } from "../core/slo";
import { ASYNC_FLOW, ENDPOINTS, FLOW_IDS, SLO_TARGET } from "../core/topology";
import type { FaultView, IncidentView, MinutePoint } from "../worker/protocol";
import { clock, faultLabel, minutes, ms, pct } from "./format";
import { label } from "./ServiceMap";
import { FLOW_LABEL } from "./theme";

interface Props {
  incident: IncidentView | null;
  /** The fault that most likely started it, if the visitor may know it. */
  fault: FaultView | null;
  hiddenFault: FaultView | null;
  startHour: number;
  warming: boolean;
  onReveal: (id: number) => void;
  latest: MinutePoint | null;
}

/** One minute's error ratio is marked once it burns budget at the slow-burn rate; single minutes of a small flow are too noisy for less. */
const ERR_MARK = PAGE_RULES[1].factor * (1 - SLO_TARGET);

const SLO_MS: Record<string, number> = Object.fromEntries([...ENDPOINTS.map((e) => [e.id, e.sloMs]), [ASYNC_FLOW.id, ASYNC_FLOW.sloMs]]);

/** Each flow against its SLO at the last closed minute. */
function SloBoard({ latest }: { latest: MinutePoint | null }) {
  if (!latest) return null;
  return (
    <table className="slo-board">
      <thead>
        <tr>
          <th>Flow</th>
          <th className="r">p95</th>
          <th className="r">target</th>
          <th className="r">errors</th>
          <th className="r" title={`Fast-burn rule: pages above ${PAGE_RULES[0].factor}x`}>
            burn 1 h
          </th>
        </tr>
      </thead>
      <tbody>
        {FLOW_IDS.map((f) => {
          const p = latest.flows[f];
          if (!p) return null;
          const burn = p.burn[0]?.[0] ?? 0;
          return (
            <tr key={f}>
              <td>{FLOW_LABEL[f]}</td>
              <td className={`r mono ${p.p95 > SLO_MS[f] ? "bad" : ""}`}>{ms(p.p95)}</td>
              <td className="r mono muted">{ms(SLO_MS[f])}</td>
              <td className={`r mono ${p.err >= ERR_MARK ? "bad" : ""}`}>{pct(p.err, 2)}</td>
              <td className={`r mono ${burn >= PAGE_RULES[0].factor ? "bad" : ""}`}>{burn.toFixed(1)}×</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const KIND: Record<string, string> = { "fast-burn": "fast burn", "slow-burn": "slow burn", latency: "latency", errors: "errors" };

export function evidence(c: Candidate): string[] {
  const out: string[] = [];
  if (c.zSelf > 2) out.push(`Self time ${ms(c.selfBefore)} → ${ms(c.selfAfter)} per request (z ${c.zSelf.toFixed(1)})`);
  if (c.zErr > 2) out.push(`Errors that start here ${pct(c.ownErrBefore, 2)} → ${pct(c.ownErrAfter, 1)} (z ${c.zErr.toFixed(1)})`);
  if (c.cpShare > 0.05) out.push(`${pct(c.cpShare, 0)} of the added critical-path time, +${ms(c.cpDeltaMs)} per second of traffic`);
  if (c.version) out.push(`Version ${c.version.from} → ${c.version.to} on ${pct(c.version.share, 0)} of requests`);
  if (c.inbound && c.inbound.anomaly >= 0.3) {
    const e = c.inbound;
    const parts = [];
    if (e.p95After > e.p95Before * 1.2) parts.push(`p95 ${ms(e.p95Before)} → ${ms(e.p95After)}`);
    if (e.errAfter > e.errBefore + 0.005) parts.push(`failing ${pct(e.errBefore, 1)} → ${pct(e.errAfter, 1)}`);
    if (parts.length) out.push(`Calls from ${label(e.from)}: ${parts.join(", ")}`);
  }
  return out;
}

export default function RcaCard({ incident, fault, hiddenFault, startHour, warming, onReveal, latest }: Props) {
  if (!incident) {
    return (
      <div className="rca card">
        <div className="card-head">
          <h3>Root cause</h3>
          <span className="pill ok">no incident</span>
        </div>
        <p className="rca-empty">
          {warming
            ? "Warming up: the detectors learn a baseline from the first half hour of simulated traffic."
            : "When an alert fires, an incident opens here with the services ranked by how likely they are to have caused it, and the evidence for each."}
        </p>
        <SloBoard latest={latest} />
      </div>
    );
  }
  const rca = incident.rca;
  const open = incident.closedAt === undefined;
  const top = rca?.ranking.slice(0, 5) ?? [];
  const maxScore = Math.max(1e-9, ...top.map((c) => c.score));
  const truth = fault ?? null;
  const rankOf = (svc: string, list: string[]) => list.indexOf(svc) + 1;
  const ourRank = truth && rca ? rankOf(truth.service, rca.ranking.map((c) => c.node)) : 0;
  const detectMin = truth ? (incident.openedAt - truth.startMs) / 60_000 : null;

  return (
    <div className={`rca card ${open ? "is-open" : ""}`}>
      <div className="card-head">
        <h3>
          Incident #{incident.id} <span className="muted">· {FLOW_LABEL[incident.flow] ?? incident.flow}</span>
        </h3>
        <span className={`pill ${open ? "bad" : "ok"}`}>{open ? "open" : `resolved ${clock(incident.closedAt!, startHour)}`}</span>
      </div>
      <p className="small muted mono rca-meta">
        opened {clock(incident.openedAt, startHour)} · change began ≈{clock(incident.onsetMinute * 60_000, startHour)}
        {detectMin !== null && detectMin >= 0 && <> · detected {minutes(detectMin)} after the fault</>}
      </p>
      <ul className="alerts">
        {incident.alerts.slice(0, 4).map((a) => (
          <li key={a.id} className={a.resolvedAt ? "resolved" : ""}>
            <b>{FLOW_LABEL[a.flow] ?? a.flow}</b> <span className="tag">{KIND[a.kind]}</span> <span className="muted">{a.detail}</span>
          </li>
        ))}
        {incident.alerts.length > 4 && <li className="muted small">and {incident.alerts.length - 4} more</li>}
      </ul>

      {!rca ? (
        <p className="muted">Ranking…</p>
      ) : (
        <>
          <ol className="ranking">
            {top.map((c, i) => {
              const ev = evidence(c);
              const inferred = !serviceDef(c.node)?.instrumented;
              return (
                <li key={c.node} className={i === 0 ? "first" : ""}>
                  <div className="rank-row">
                    <span className="rank-n mono">{i + 1}</span>
                    <span className="rank-name">
                      {label(c.node)}
                      {inferred && <span className="tag" title="Emits no spans; seen through its callers' client spans">inferred</span>}
                      {truth && truth.service === c.node && <span className="tag good">the fault</span>}
                    </span>
                    <span className="rank-bar" aria-hidden>
                      <span style={{ width: `${(c.score / maxScore) * 100}%` }} />
                    </span>
                    <span className="rank-score mono">{c.score.toFixed(2)}</span>
                  </div>
                  {i === 0 ? (
                    <div className="rank-ev">
                      {ev.length > 0 && (
                        <ul>
                          {ev.map((e) => (
                            <li key={e}>{e}</li>
                          ))}
                        </ul>
                      )}
                      {c.path.length > 1 && (
                        <p className="path mono">
                          {c.path.map((p, k) => (
                            <span key={k}>
                              {k > 0 && <span className="arrow">→</span>}
                              {label(p)}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  ) : (
                    ev.length > 0 && <p className="rank-ev small muted">{ev[0]}</p>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="baselines">
            <span className="label">What a dashboard would point at</span>
            <dl>
              {(
                [
                  ["Highest p99", rca.baselines.highestP99],
                  ["Biggest p99 jump", rca.baselines.p99Jump],
                  ["Service that alerted", rca.baselines.alerting],
                ] as const
              ).map(([name, list]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>
                    {label(list[0] ?? "–")}
                    {truth && list[0] && <span className={list[0] === truth.service ? "ok-mark" : "no-mark"}>{list[0] === truth.service ? " ✓" : " ✗"}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {truth && (
            <p className={`verdict ${ourRank === 1 ? "good" : "meh"}`}>
              {truth.mystery ? "The mystery fault was " : "Injected: "}
              <b>
                {label(truth.service)}, {faultLabel(truth.kind, truth.magnitude)}
              </b>
              . Tracewise ranks it <b>#{ourRank || "–"}</b>.
            </p>
          )}
          {hiddenFault && (
            <button className="reveal" onClick={() => onReveal(hiddenFault.id)}>
              Reveal the mystery fault
            </button>
          )}
        </>
      )}
    </div>
  );
}
