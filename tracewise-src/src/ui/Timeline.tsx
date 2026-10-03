import { useEffect, useRef, useState } from "react";
import { PAGE_RULES } from "../core/slo";
import { ASYNC_FLOW, ENDPOINTS, FLOW_IDS } from "../core/topology";
import type { FaultView, IncidentView, MinutePoint } from "../worker/protocol";
import { clock, ms, pct } from "./format";
import { label } from "./ServiceMap";
import { C, FLOW_LABEL } from "./theme";

const SLO_MS: Record<string, number> = Object.fromEntries([...ENDPOINTS.map((e) => [e.id, e.sloMs]), [ASYNC_FLOW.id, ASYNC_FLOW.sloMs]]);
const WINDOW_MIN = 60;

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

interface Props {
  points: MinutePoint[];
  incidents: IncidentView[];
  faults: FaultView[];
  revealed: Set<number>;
  nowMs: number;
  startHour: number;
}

export default function Timeline({ points, incidents, faults, revealed, nowMs, startHour }: Props) {
  const [pick, setPick] = useState<string | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const last = incidents[incidents.length - 1];
  const flow = pick ?? (last && (last.closedAt === undefined || nowMs - last.closedAt < 20 * 60_000) ? last.flow : "checkout");

  const W = Math.max(280, width);
  const narrow = W < 520;
  const padL = narrow ? 40 : 52;
  const padR = 12;
  const rows = { lat: { y: 14, h: narrow ? 84 : 104 }, err: { y: 0, h: 44 }, burn: { y: 0, h: 52 } };
  rows.err.y = rows.lat.y + rows.lat.h + 26;
  rows.burn.y = rows.err.y + rows.err.h + 26;
  const H = rows.burn.y + rows.burn.h + 24;
  const t1 = nowMs;
  const t0 = t1 - WINDOW_MIN * 60_000;
  const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * (W - padL - padR);
  const pts = points.filter((p) => (p.minute + 1) * 60_000 >= t0 && p.flows[flow]);
  const midT = (m: number) => m * 60_000 + 30_000;
  const sloMs = SLO_MS[flow];

  // Latency on a log scale that always shows the SLO line.
  const lats = pts.flatMap((p) => [p.flows[flow].p95, p.flows[flow].p50]).filter((v) => Number.isFinite(v) && v > 0);
  const lo = Math.max(0.5, Math.min(sloMs / 4, ...lats) * 0.8);
  const hi = Math.max(sloMs * 1.5, ...lats) * 1.15;
  const yLat = (v: number) => rows.lat.y + rows.lat.h - ((Math.log(Math.max(v, lo)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * rows.lat.h;
  const errMax = Math.max(0.02, ...pts.map((p) => p.flows[flow].err)) * 1.1;
  const yErr = (v: number) => rows.err.y + rows.err.h - (v / errMax) * rows.err.h;
  const BURN_CAP = 60;
  const yBurn = (v: number) => rows.burn.y + rows.burn.h - Math.sqrt(Math.min(v, BURN_CAP) / BURN_CAP) * rows.burn.h;
  const fast = PAGE_RULES[0].factor;

  const line = (get: (p: MinutePoint) => number, y: (v: number) => number) => {
    let d = "";
    let pen = false;
    for (const p of pts) {
      const v = get(p);
      if (!Number.isFinite(v)) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(midT(p.minute)).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const errArea = pts.length ? `${line((p) => p.flows[flow].err, yErr)}L${x(midT(pts[pts.length - 1].minute)).toFixed(1)},${rows.err.y + rows.err.h}L${x(midT(pts[0].minute)).toFixed(1)},${rows.err.y + rows.err.h}Z` : "";
  const barW = Math.max(1.5, ((W - padL - padR) / WINDOW_MIN) * 0.62);

  const ticks: number[] = [];
  const step = narrow ? 20 : 10;
  for (let m = Math.ceil(t0 / 60_000 / step) * step; m * 60_000 <= t1; m += step) ticks.push(m * 60_000);

  const shownFaults = faults.filter((f) => (f.endMs ?? Infinity) > t0 && f.startMs < t1);
  const shownInc = incidents.filter((i) => (i.closedAt ?? t1) > t0);
  const latest = pts[pts.length - 1]?.flows[flow];

  return (
    <div className="timeline card">
      <div className="card-head">
        <h3>Incident timeline</h3>
        <div className="tabs" role="group" aria-label="Flow to show">
          {FLOW_IDS.map((f) => (
            <button key={f} aria-pressed={f === flow} className={f === flow ? "on" : ""} onClick={() => setPick(f)}>
              {FLOW_LABEL[f]}
            </button>
          ))}
        </div>
      </div>
      <div className="tl-legend small">
        <span>
          <i className="sw lat" /> p95
        </span>
        <span>
          <i className="sw p50" /> p50
        </span>
        <span>
          <i className="sw slo" /> SLO {ms(sloMs)}
        </span>
        <span>
          <i className="sw fault" /> fault
        </span>
        <span>
          <i className="sw det" /> alert
        </span>
        {latest && (
          <span className="mono muted tl-now">
            now p95 {ms(latest.p95)} · errors {pct(latest.err, 2)}
          </span>
        )}
      </div>
      <div ref={ref} className="tl-svg">
        {width > 0 && (
          <svg width={W} height={H} role="img" aria-label={`Last hour of ${FLOW_LABEL[flow]}: p95 latency, error rate and SLO burn rate per minute, with faults and alerts marked.`}>
            {/* Faults and incidents behind the data. */}
            {shownFaults.map((f) => {
              const a = x(Math.max(t0, f.startMs));
              const b = x(Math.min(t1, f.endMs ?? t1));
              const hidden = f.mystery && !revealed.has(f.id);
              return (
                <g key={`f${f.id}`}>
                  <rect x={a} y={6} width={Math.max(1, b - a)} height={H - 30} fill="rgba(255,107,87,0.07)" />
                  <line x1={a} x2={a} y1={6} y2={H - 24} stroke={C.bad} strokeDasharray="3 3" strokeWidth={1} />
                  {(() => {
                    const text = hidden ? "mystery fault" : `${label(f.service)} ${f.kind}`;
                    const fits = a + 6 + text.length * 6.2 < W - padR;
                    return (
                      <text x={fits ? a + 4 : a - 4} y={rows.err.y - 9} textAnchor={fits ? "start" : "end"} className="tl-mark" fill={C.bad}>
                        {text}
                      </text>
                    );
                  })()}
                </g>
              );
            })}
            {shownInc.map((inc) => {
              const a = x(Math.max(t0, inc.openedAt));
              const b = x(Math.min(t1, inc.closedAt ?? t1));
              return (
                <g key={`i${inc.id}`}>
                  <line x1={a} x2={a} y1={4} y2={H - 24} stroke={C.accent} strokeWidth={1.4} />
                  <rect x={a} y={2} width={Math.max(2, b - a)} height={4} rx={2} fill={C.accent} opacity={0.8} />
                  <text x={a + 50 < W - padR ? a + 4 : a - 4} y={rows.lat.y + 10} textAnchor={a + 50 < W - padR ? "start" : "end"} className="tl-mark" fill={C.accent}>
                    alert #{inc.id}
                  </text>
                </g>
              );
            })}

            {/* Latency. */}
            <text x={4} y={rows.lat.y + 4} className="tl-axis">
              {ms(hi)}
            </text>
            <text x={4} y={rows.lat.y + rows.lat.h} className="tl-axis">
              {ms(lo)}
            </text>
            <line x1={padL} x2={W - padR} y1={yLat(sloMs)} y2={yLat(sloMs)} stroke={C.warn} strokeDasharray="5 4" opacity={0.7} />
            <path d={line((p) => p.flows[flow].p50, yLat)} fill="none" stroke={C.muted} strokeWidth={1.2} opacity={0.7} />
            <path d={line((p) => p.flows[flow].p95, yLat)} fill="none" stroke={C.text} strokeWidth={1.8} />
            <text x={padL} y={rows.lat.y - 4} className="tl-row">
              latency (log)
            </text>

            {/* Errors. */}
            <text x={padL} y={rows.err.y - 4} className="tl-row">
              errors
            </text>
            <text x={4} y={rows.err.y + 8} className="tl-axis">
              {pct(errMax, errMax < 0.1 ? 1 : 0)}
            </text>
            <line x1={padL} x2={W - padR} y1={rows.err.y + rows.err.h} y2={rows.err.y + rows.err.h} stroke={C.line} />
            <path d={errArea} fill="rgba(255,107,87,0.25)" stroke={C.bad} strokeWidth={1.2} />

            {/* Burn rate. */}
            <text x={padL} y={rows.burn.y - 4} className="tl-row">
              SLO burn rate · bars 5 min, line 1 h
            </text>
            <line x1={padL} x2={W - padR} y1={yBurn(fast)} y2={yBurn(fast)} stroke={C.bad} strokeDasharray="4 3" opacity={0.6} />
            <text x={4} y={yBurn(fast) + 4} className="tl-axis">
              {fast}×
            </text>
            {pts.map((p) => {
              const [long, short] = p.flows[flow].burn[0] ?? [0, 0];
              const y = yBurn(short);
              const on = short >= fast && long >= fast;
              return <rect key={p.minute} x={x(midT(p.minute)) - barW / 2} y={y} width={barW} height={Math.max(0, rows.burn.y + rows.burn.h - y)} fill={on ? C.bad : short >= fast ? C.warn : "rgba(197,244,103,0.45)"} />;
            })}
            <path d={line((p) => p.flows[flow].burn[0]?.[0] ?? 0, yBurn)} fill="none" stroke={C.text} strokeWidth={1.2} opacity={0.8} />

            {/* Time axis. */}
            {ticks.map((t) => (
              <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="tl-axis">
                {clock(t, startHour)}
              </text>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}
