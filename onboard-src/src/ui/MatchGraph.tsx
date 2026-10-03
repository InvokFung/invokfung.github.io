// One customer's records as a graph: nodes are records, edges are candidate
// pairs weighted by match probability. The slider moves the match threshold
// for this graph only, re-running the same constrained union-find the worker
// uses, so you can see which merges a different threshold would make.

import { useMemo, useState } from "react";
import { useMedia } from "./hooks";
import { prob as fmtProb } from "../format";
import { sourceColor, sourceShort } from "../palette";
import type { ClusterView, EdgeView } from "../worker/protocol";

/** Deterministic force layout: repulsion, springs whose rest length shrinks with match probability, a pull to the centre. */
function layout(ids: number[], edges: EdgeView[], VW: number, VH: number, MX = 170): Map<number, [number, number]> {
  const n = ids.length;
  const pos = ids.map((_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(a) * 120, Math.sin(a) * 90] as [number, number];
  });
  const index = new Map(ids.map((id, i) => [id, i]));
  for (let it = 0; it < 400; it++) {
    const f = pos.map(() => [0, 0]);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i][0] - pos[j][0];
        const dy = pos[i][1] - pos[j][1];
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const rep = 16000 / d2;
        const d = Math.sqrt(d2);
        f[i][0] += (dx / d) * rep;
        f[i][1] += (dy / d) * rep;
        f[j][0] -= (dx / d) * rep;
        f[j][1] -= (dy / d) * rep;
      }
    for (const e of edges) {
      const i = index.get(e.a)!;
      const j = index.get(e.b)!;
      const dx = pos[j][0] - pos[i][0];
      const dy = pos[j][1] - pos[i][1];
      const d = Math.max(Math.hypot(dx, dy), 0.01);
      const rest = 110 + (1 - e.prob) * 190;
      const k = 0.02 + 0.06 * e.prob;
      const s = (d - rest) * k;
      f[i][0] += (dx / d) * s;
      f[i][1] += (dy / d) * s;
      f[j][0] -= (dx / d) * s;
      f[j][1] -= (dy / d) * s;
    }
    const cool = 1 - it / 400;
    for (let i = 0; i < n; i++) {
      f[i][0] -= pos[i][0] * 0.01;
      f[i][1] -= pos[i][1] * 0.014;
      pos[i][0] += Math.max(-12, Math.min(12, f[i][0])) * cool;
      pos[i][1] += Math.max(-12, Math.min(12, f[i][1])) * cool;
    }
  }
  // A square or tall view box (phones) fits a wide layout better turned on its side.
  {
    const w = Math.max(...pos.map((p) => p[0])) - Math.min(...pos.map((p) => p[0]));
    const h = Math.max(...pos.map((p) => p[1])) - Math.min(...pos.map((p) => p[1]));
    const fit = (a: number, b: number) => Math.min((VW - MX) / Math.max(1, a), (VH - 120) / Math.max(1, b));
    if (fit(h, w) > fit(w, h) * 1.15) for (const p of pos) [p[0], p[1]] = [-p[1], p[0]];
  }
  // fit to the view box
  const xs = pos.map((p) => p[0]);
  const ys = pos.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sx = (VW - MX) / Math.max(1, maxX - minX);
  const sy = (VH - 120) / Math.max(1, maxY - minY);
  const s = Math.min(sx, sy, 2.4);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return new Map(ids.map((id, i) => [id, [VW / 2 + (pos[i][0] - cx) * s, VH / 2 - 8 + (pos[i][1] - cy) * s]]));
}

/** The worker's clustering rule, on this graph only: strongest pairs first, never joining records a guard or a reviewer kept apart. */
export function componentsAt(ids: number[], edges: EdgeView[], threshold: number): Map<number, number> {
  const parent = new Map(ids.map((i) => [i, i]));
  const find = (x: number): number => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const cannot: [number, number][] = edges.filter((e) => e.status === "guarded" || e.status === "rejected").map((e) => [e.a, e.b]);
  const merges = edges.filter((e) => e.status === "accepted" || (e.prob >= threshold && e.status !== "guarded" && e.status !== "rejected")).sort((x, y) => (y.status === "accepted" ? 1 : 0) - (x.status === "accepted" ? 1 : 0) || y.prob - x.prob);
  for (const e of merges) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra === rb) continue;
    const conflict = cannot.some(([x, y]) => (find(x) === ra && find(y) === rb) || (find(x) === rb && find(y) === ra));
    if (conflict && e.status !== "accepted") continue;
    parent.set(ra, rb);
  }
  const label = new Map<number, number>();
  const roots = new Map<number, number>();
  for (const i of ids) {
    const r = find(i);
    if (!roots.has(r)) roots.set(r, roots.size);
    label.set(i, roots.get(r)!);
  }
  return label;
}

export const logit = (p: number) => Math.log2(p / (1 - p));
export const sigmoid = (x: number) => 1 / (1 + 2 ** -x);

const STATUS_LABEL: Record<EdgeView["status"], string> = {
  auto: "merged automatically",
  review: "in the review queue",
  below: "below the review threshold",
  accepted: "accepted by a reviewer",
  rejected: "rejected by a reviewer",
  guarded: "kept apart by a guard rule",
};

export function edgeStatusLabel(e: EdgeView) {
  return STATUS_LABEL[e.status];
}

interface Props {
  view: ClusterView;
  order: string[];
  threshold: number;
  onThreshold: (p: number) => void;
  selected: number | null;
  onSelect: (pair: number) => void;
  highlight: Set<number>;
  showTruth: boolean;
}

export default function MatchGraph({ view, order, threshold, onThreshold, selected, onSelect, highlight, showTruth }: Props) {
  const narrow = useMedia("(max-width: 560px)");
  const VW = narrow ? 380 : 520;
  const VH = narrow ? 460 : 330;
  const ids = useMemo(() => view.records.map((r) => r.i), [view]);
  const pos = useMemo(() => layout(ids, view.edges, VW, VH, narrow ? 130 : 170), [ids, view.edges, VW, VH, narrow]);
  const comp = useMemo(() => componentsAt(ids, view.edges, threshold), [ids, view.edges, threshold]);
  const inside = new Set(view.golden.members);
  const recById = new Map(view.records.map((r) => [r.i, r]));
  // the component holding most of the golden record's members draws in the golden colour
  const counts = new Map<number, number>();
  for (const m of view.golden.members) counts.set(comp.get(m)!, (counts.get(comp.get(m)!) ?? 0) + 1);
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const groups = new Set(comp.values()).size;
  const truthGroups = view.truth ? new Set(Object.values(view.truth)).size : null;
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className="graph">
      <svg viewBox={`0 0 ${VW} ${VH}`} className="graph-svg" role="group" aria-label={`Match graph: ${ids.length} records, ${view.edges.length} candidate pairs`}>
        {view.edges.map((e) => {
          const [x1, y1] = pos.get(e.a)!;
          const [x2, y2] = pos.get(e.b)!;
          const merges = e.status === "accepted" || (e.prob >= threshold && e.status !== "guarded" && e.status !== "rejected");
          const cls = `edge ${merges ? "is-merge" : ""} st-${e.status} ${selected === e.pair ? "is-selected" : ""} ${hover === e.pair ? "is-hover" : ""}`;
          const width = 1 + Math.max(0, Math.min(1, (e.weight + 10) / 40)) * 6;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          return (
            <g key={e.pair} className={cls}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={width} />
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className="edge-hit"
                onClick={() => onSelect(e.pair)}
                onMouseEnter={() => setHover(e.pair)}
                onMouseLeave={() => setHover(null)}
              />
              {(selected === e.pair || hover === e.pair) && (
                <g className="edge-tag" transform={`translate(${mx},${my})`} pointerEvents="none">
                  <rect x={-30} y={-10} width={60} height={20} rx={5} />
                  <text textAnchor="middle" y={4}>
                    {e.prob >= 0.9995 ? "1.000" : e.prob.toFixed(3)}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {ids.map((id) => {
          const r = recById.get(id)!;
          const [x, y] = pos.get(id)!;
          const c = comp.get(id)!;
          const isMain = c === main;
          return (
            <g key={id} className={`node ${inside.has(id) ? "" : "is-outside"} ${highlight.has(id) ? "is-lit" : ""}`} transform={`translate(${x},${y})`} style={{ color: sourceColor(r.source, order) }}>
              <circle r={25} className={`node-ring ${isMain ? "is-main" : ""}`} />
              <circle r={18} className="node-bg" />
              <circle r={18} className="node-dot" />
              <text className="node-src" textAnchor="middle" y={4}>
                {sourceShort(r.source).slice(0, 3).toUpperCase()}
              </text>
              <text className="node-name" textAnchor="middle" y={42}>
                {r.name.length > 20 ? r.name.slice(0, 19) + "…" : r.name || "(no name)"}
              </text>
              {!isMain && (
                <text className="node-group" textAnchor="middle" y={-30}>
                  not merged
                </text>
              )}
              {showTruth && view.truth && (
                <g transform="translate(18,-18)">
                  <circle r={9} className="truth-badge" />
                  <text textAnchor="middle" y={3.5} className="truth-text">
                    {String.fromCharCode(65 + view.truth[id])}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="slider">
        <label htmlFor="th">
          Match threshold <b className="mono">{fmtProb(threshold)}</b>
        </label>
        <input id="th" type="range" min={-6} max={24} step={0.25} value={Math.max(-6, Math.min(24, logit(threshold)))} onChange={(e) => onThreshold(sigmoid(Number(e.target.value)))} aria-valuetext={`probability ${fmtProb(threshold)}`} />
        <div className="slider-scale mono" aria-hidden="true">
          {[0.5, 0.95, 0.9999].map((p) => (
            <span key={p} style={{ left: `${((logit(p) + 6) / 30) * 100}%` }}>
              {p}
            </span>
          ))}
        </div>
        <p className="slider-out">
          At this threshold these records form <b>{groups === 1 ? "one customer" : `${groups} customers`}</b>
          {truthGroups !== null && (
            <>
              ; the generator made <b>{truthGroups === 1 ? "one" : truthGroups}</b>
            </>
          )}
          . Dashed red edges are pairs a guard rule keeps apart: different first names, or different birth dates.
        </p>
      </div>
    </div>
  );
}
