import { rrf, type FusedHit } from "../search/engine";

// Fixed drawing space; the SVG scales to its container.
const W = 340;
const L = 46; // keyword axis
const C = 170; // fused ranks
const R = 294; // meaning axis
const TOP = 46;
const BOTTOM = 286;
const NONE = 318; // "not in the top 100"

/** Ranks 1..100 on a log scale, best at the top. */
const y = (rank: number | null) => (rank === null ? NONE : TOP + (Math.log(rank) / Math.log(100)) * (BOTTOM - TOP));
const TICKS = [1, 3, 10, 30, 100];

interface Props {
  hits: FusedHit[];
  active: number | null;
  onActive: (i: number | null) => void;
}

/**
 * Where each of the top fused results ranked in the keyword list (left) and
 * the meaning list (right). Line width is that list's share of the fused score.
 */
export default function RankFlow({ hits, active, onActive }: Props) {
  const rows = hits.length;
  const cy = (i: number) => TOP + (rows > 1 ? (i / (rows - 1)) * (BOTTOM - TOP) : 0);
  const width = (rank: number | null) => 1.2 + rrf(rank) * 61 * 5.5;
  return (
    <figure className="rankflow">
      <svg viewBox={`0 0 ${W} 340`} role="img" aria-label="How the keyword and meaning ranks fuse into the final ranking">
        <text x={L} y={20} className="rf-head kw" textAnchor="middle">
          Keyword
        </text>
        <text x={C} y={20} className="rf-head" textAnchor="middle">
          Fused
        </text>
        <text x={R} y={20} className="rf-head sem" textAnchor="middle">
          Meaning
        </text>
        {[L, R].map((x) => (
          <g key={x} className="rf-axis">
            <line x1={x} x2={x} y1={TOP} y2={BOTTOM} />
            {TICKS.map((t) => (
              <g key={t}>
                <line x1={x - 3} x2={x + 3} y1={y(t)} y2={y(t)} />
                <text x={x === L ? x - 8 : x + 8} y={y(t) + 3.5} textAnchor={x === L ? "end" : "start"}>
                  #{t}
                </text>
              </g>
            ))}
            <text x={x === L ? x - 8 : x + 8} y={NONE + 3.5} textAnchor={x === L ? "end" : "start"} className="rf-none">
              none
            </text>
          </g>
        ))}
        {hits.map((h, i) => {
          const dim = active !== null && active !== i;
          const yc = cy(i);
          return (
            <g key={h.chunk} className={`rf-row ${dim ? "dim" : ""} ${active === i ? "on" : ""}`} onMouseEnter={() => onActive(i)} onMouseLeave={() => onActive(null)}>
              <path
                className={`rf-line kw ${h.kw === null ? "missing" : ""}`}
                d={`M${L} ${y(h.kw)} C${(L + C) / 2} ${y(h.kw)} ${(L + C) / 2} ${yc} ${C - 11} ${yc}`}
                strokeWidth={width(h.kw)}
                style={{ animationDelay: `${i * 0.04}s` }}
              />
              <path
                className={`rf-line sem ${h.sem === null ? "missing" : ""}`}
                d={`M${R} ${y(h.sem)} C${(R + C) / 2} ${y(h.sem)} ${(R + C) / 2} ${yc} ${C + 11} ${yc}`}
                strokeWidth={width(h.sem)}
                style={{ animationDelay: `${i * 0.04 + 0.1}s` }}
              />
              <circle cx={C} cy={yc} r={11} className="rf-node" />
              <text x={C} y={yc + 4} textAnchor="middle" className="rf-num">
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        Where each top result ranked in each list. Thicker lines add more to the fused score; a result one list missed can still win on the other.
      </figcaption>
    </figure>
  );
}
