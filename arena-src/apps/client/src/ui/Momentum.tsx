import type { PlayerState, ScorePoint } from "@arena/engine";
import { seatColor } from "./format";

/**
 * Score over time for every player: a projection of the event log, drawn as step lines.
 * Claims are dots, misses with a penalty are red ticks. `cursor` draws the replay playhead.
 */
export function Momentum({
  timeline,
  players,
  start,
  end,
  cursor = null,
  height = 120,
}: {
  timeline: ReadonlyMap<string, readonly ScorePoint[]>;
  players: readonly Pick<PlayerState, "id" | "seat" | "name">[];
  start: number;
  end: number;
  cursor?: number | null;
  height?: number;
}) {
  const W = 600;
  const H = height;
  const pad = { l: 6, r: 6, t: 10, b: 14 };
  let max = 500;
  for (const pts of timeline.values()) for (const p of pts) max = Math.max(max, p.score);
  const span = Math.max(1, end - start);
  const x = (t: number) => pad.l + ((Math.min(end, Math.max(start, t)) - start) / span) * (W - pad.l - pad.r);
  const y = (s: number) => H - pad.b - (s / max) * (H - pad.t - pad.b);

  return (
    <svg className="momentum" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Score over time for each player">
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="axis" />
      <line x1={x(start + span / 2)} x2={x(start + span / 2)} y1={pad.t} y2={H - pad.b} className="half" />
      {players.map((p) => {
        const pts = timeline.get(p.id) ?? [];
        if (pts.length === 0) return null;
        let d = `M${x(pts[0]!.at)},${y(pts[0]!.score)}`;
        for (let i = 1; i < pts.length; i++) d += `H${x(pts[i]!.at)}V${y(pts[i]!.score)}`;
        const color = seatColor(p.seat);
        return (
          <g key={p.id}>
            <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            {pts.map((pt, i) =>
              pt.kind === "claim" ? (
                <circle key={i} cx={x(pt.at)} cy={y(pt.score)} r={2.6} fill={color} />
              ) : pt.kind === "fail" && i > 0 && pts[i - 1]!.score > pt.score ? (
                <line key={i} x1={x(pt.at)} x2={x(pt.at)} y1={y(pt.score) - 5} y2={y(pt.score) + 5} stroke="#f87171" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              ) : null,
            )}
          </g>
        );
      })}
      {cursor !== null && <line x1={x(cursor)} x2={x(cursor)} y1={pad.t - 6} y2={H - pad.b + 4} className="cursor" />}
    </svg>
  );
}
