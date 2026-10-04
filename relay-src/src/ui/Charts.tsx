// Four live sparklines over the last 60 s, one point per 500 ms, each over a
// rolling 10 s window. Plain SVG.

import type { SeriesPoint } from "../live/engine";
import { fmtMs, fmtUsd } from "../data";

const SLOTS = 120;
const W = 200;
const H = 64;

type Line = { values: (number | null)[]; color: string; dashed?: boolean; area?: boolean };

function path(values: (number | null)[], lo: number, hi: number): string {
  const off = SLOTS - values.length;
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    const x = ((off + i) / (SLOTS - 1)) * W;
    const y = H - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1)) * H;
    d += `${pen ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    pen = true;
  });
  return d;
}

function areaPath(values: (number | null)[], lo: number, hi: number): string {
  const off = SLOTS - values.length;
  const pts: string[] = [];
  let firstX = -1;
  let lastX = -1;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return;
    const x = ((off + i) / (SLOTS - 1)) * W;
    const y = H - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1)) * H;
    if (firstX < 0) firstX = x;
    lastX = x;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (pts.length < 2) return "";
  return `M${firstX.toFixed(1)},${H} L${pts.join(" L")} L${lastX.toFixed(1)},${H} Z`;
}

function Spark({ lines, lo, hi, label, guide }: { lines: Line[]; lo: number; hi: number; label: string; guide?: number }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <line x1="0" x2={W} y1={H} y2={H} stroke="#222a26" vectorEffect="non-scaling-stroke" />
      {guide !== undefined ? <line x1="0" x2={W} y1={H - ((guide - lo) / (hi - lo || 1)) * H} y2={H - ((guide - lo) / (hi - lo || 1)) * H} stroke="#2e3833" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" /> : null}
      {lines.map((l, i) => (l.area ? <path key={`a${i}`} d={areaPath(l.values, lo, hi)} fill={l.color} opacity="0.1" /> : null))}
      {lines.map((l, i) => (
        <path key={i} d={path(l.values, lo, hi)} fill="none" stroke={l.color} strokeWidth="1.8" strokeDasharray={l.dashed ? "4 3" : undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

const lastOf = (xs: (number | null)[]) => {
  for (let i = xs.length - 1; i >= 0; i--) if (xs[i] !== null) return xs[i];
  return null;
};

export function Charts({ series }: { series: SeriesPoint[] }) {
  const success = series.map((s) => s.success);
  const p50 = series.map((s) => s.p50);
  const p99 = series.map((s) => s.p99);
  const cost = series.map((s) => s.costPerMin);
  const hit = series.map((s) => s.cacheHit);
  const sNow = lastOf(success);
  const sMin = Math.min(0.9, ...success.filter((x): x is number => x !== null));
  const latMax = Math.max(1000, ...p99.filter((x): x is number => x !== null)) * 1.1;
  const costMax = Math.max(0.01, ...cost) * 1.15;
  const p50Now = lastOf(p50);
  const p99Now = lastOf(p99);
  const costNow = lastOf(cost);
  const hitNow = lastOf(hit);
  return (
    <div className="charts">
      <div className="panel chart">
        <h3>Success rate</h3>
        <div className="big" style={{ color: sNow !== null && sNow < 0.95 ? "var(--peach)" : undefined }}>
          {sNow === null ? "–" : `${(sNow * 100).toFixed(1)}%`}
          <small>served</small>
        </div>
        <Spark lines={[{ values: success, color: "#5fe0a4" }]} lo={Math.floor(sMin * 10) / 10} hi={1} label="Success rate over the last minute" />
        <div className="axis">
          <span>60 s</span>
          <span>now</span>
        </div>
      </div>
      <div className="panel chart">
        <h3>
          Latency <span style={{ color: "#cfe0d7" }}>p50</span> / <span style={{ color: "#ffa26b" }}>p99</span>
        </h3>
        <div className="big">
          {fmtMs(p50Now)}
          <small>{fmtMs(p99Now)}</small>
        </div>
        <Spark
          lines={[
            { values: p99, color: "#ffa26b", area: true },
            { values: p50, color: "#cfe0d7" },
          ]}
          lo={0}
          hi={latMax}
          label="p50 and p99 latency of upstream-served requests over the last minute"
        />
        <div className="axis">
          <span>0–{fmtMs(latMax)}</span>
          <span>now</span>
        </div>
      </div>
      <div className="panel chart">
        <h3>Spend per minute</h3>
        <div className="big">
          {costNow === null ? "–" : fmtUsd(costNow)}
          <small>metered</small>
        </div>
        <Spark lines={[{ values: cost, color: "#c6f36a", area: true }]} lo={0} hi={costMax} label="Metered spend per minute" />
        <div className="axis">
          <span>60 s</span>
          <span>now</span>
        </div>
      </div>
      <div className="panel chart">
        <h3>Cache hit rate</h3>
        <div className="big">
          {hitNow === null ? "–" : `${(hitNow * 100).toFixed(0)}%`}
          <small>exact + near</small>
        </div>
        <Spark lines={[{ values: hit, color: "#c6f36a" }]} lo={0} hi={1} label="Cache hit rate over the last minute" />
        <div className="axis">
          <span>60 s</span>
          <span>now</span>
        </div>
      </div>
    </div>
  );
}
