import { useMemo, useRef, useState } from "react";
import { formatCents, isBlackKey, noteLabel, octaveOf, pitchClass } from "../dsp/notes";
import type { NoteStat } from "../state/history";
import { live } from "../state/app";
import { centsColor } from "./colors";
import { setText, useAnimationFrame } from "./hooks";

/**
 * Violin fingerboard and piano keyboard, drawn in SVG. Both work as a live
 * display (the note you are playing lights up where it is played, offset by
 * how sharp or flat it is) and as a heatmap of practice history.
 */

interface CommonProps {
  /** Heatmap data: per-note mean deviation and count. */
  stats?: Map<number, NoteStat>;
  /** Notes to mark as part of the current drill. */
  highlight?: number[];
  /** The note being asked for. */
  target?: number | null;
  /** Follow the live pitch. */
  live?: boolean;
  /** What the deviation is measured against while live (defaults to the nearest note). */
  reference?: () => number | null;
  ariaLabel: string;
  /** Narrow layout for side panels: fewer units across, so text and notes render larger. */
  compact?: boolean;
}

interface Tip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <b>{tip.title}</b>
      {tip.lines.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </div>
  );
}

const describeStat = (s: NoteStat) => [
  `${s.count} ${s.count === 1 ? "note" : "notes"} played`,
  `average ${formatCents(s.mean, 1)}¢ (${Math.abs(s.mean) <= 5 ? "in tune" : s.mean > 0 ? "sharp" : "flat"})`,
  `typical miss ±${s.meanAbs.toFixed(1)}¢`,
];

// ---------------------------------------------------------------- violin

const STRINGS = [
  { name: "E", open: 76 },
  { name: "A", open: 69 },
  { name: "D", open: 62 },
  { name: "G", open: 55 },
];

/** Where a note is played in the lowest position: the highest string at or below it. */
export function violinPlace(midi: number): { string: number; offset: number } | null {
  for (let s = 0; s < STRINGS.length; s++) if (midi >= STRINGS[s].open) return { string: s, offset: midi - STRINGS[s].open };
  return null;
}

const FINGER: Record<number, string> = {
  0: "open string",
  1: "1st finger, low",
  2: "1st finger",
  3: "2nd finger, low",
  4: "2nd finger, high",
  5: "3rd finger",
  6: "3rd finger high / 4th low",
  7: "4th finger",
};

export function Fingerboard({ stats, highlight = [], target = null, live: isLive = false, reference, ariaLabel, compact = false }: CommonProps) {
  const notes = useMemo(() => [...(stats?.keys() ?? []), ...highlight, ...(target !== null ? [target] : [])], [stats, highlight, target]);
  const maxOffset = Math.max(7, ...notes.map((m) => violinPlace(m)?.offset ?? 0));
  const W = compact ? 440 : 640;
  const H = compact ? 168 : 176;
  const nut = 76;
  const end = W - 16;
  // Fretless, but physics still applies: the stop for n semitones sits at L·(1 − 2^(−n/12)) from the nut.
  const reach = 1 - 2 ** (-(maxOffset + 0.7) / 12);
  const x = (n: number) => (n <= 0 ? nut - 28 + 28 * Math.max(-0.5, n) : nut + ((end - nut) * (1 - 2 ** (-n / 12))) / reach);
  const y = (s: number) => 30 + s * (compact ? 37 : 39);
  const [tip, setTip] = useState<Tip | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const dotLabel = useRef<SVGTextElement>(null);

  useAnimationFrame(() => {
    if (!isLive || !dot.current) return;
    const m = live.state.display;
    const place = Number.isFinite(m) ? violinPlace(Math.round(m)) : null;
    if (!place) {
      dot.current.setAttribute("opacity", "0");
      dotLabel.current?.setAttribute("opacity", "0");
      return;
    }
    const ref = reference?.() ?? Math.round(m);
    const cx = x(place.offset + (m - Math.round(m)));
    const cy = y(place.string);
    dot.current.setAttribute("cx", cx.toFixed(1));
    dot.current.setAttribute("cy", cy.toFixed(1));
    dot.current.setAttribute("opacity", "1");
    dot.current.setAttribute("fill", centsColor((m - ref) * 100));
    if (dotLabel.current) {
      dotLabel.current.setAttribute("x", cx.toFixed(1));
      dotLabel.current.setAttribute("y", (cy - 16).toFixed(1));
      dotLabel.current.setAttribute("opacity", "1");
      setText(dotLabel.current, noteLabel(Math.round(m)));
    }
  });

  const showTip = (e: React.MouseEvent | React.FocusEvent, midi: number, s: NoteStat | undefined) => {
    const p = violinPlace(midi)!;
    const box = wrap.current!.getBoundingClientRect();
    const r = (e.currentTarget as Element).getBoundingClientRect();
    setTip({
      x: r.left + r.width / 2 - box.left,
      y: r.top - box.top,
      title: `${noteLabel(midi)} · ${STRINGS[p.string].name} string`,
      lines: [p.offset <= 7 ? FINGER[p.offset] : `${p.offset} semitones up the string`, ...(s ? describeStat(s) : ["not played yet"])],
    });
  };

  const maxCount = Math.max(1, ...[...(stats?.values() ?? [])].map((s) => s.count));
  const cells: number[] = [...new Set(notes)].filter((m) => violinPlace(m)).sort((a, b) => a - b);

  return (
    <div className="viz" ref={wrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={`fingerboard${compact ? " compact" : ""}`} role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id="fb-wood" x1="0" x2="1">
            <stop offset="0" stopColor="#141a29" />
            <stop offset="1" stopColor="#0d111c" />
          </linearGradient>
        </defs>
        <rect x={nut} y={12} width={end - nut + 8} height={H - 24} rx={10} fill="url(#fb-wood)" stroke="rgba(148,163,184,.14)" />
        {Array.from({ length: maxOffset }, (_, i) => i + 1).map((n) => (
          <line key={n} x1={x(n)} x2={x(n)} y1={18} y2={H - 18} stroke={n % 12 === 0 ? "rgba(129,140,248,.45)" : n === 7 ? "rgba(148,163,184,.22)" : "rgba(148,163,184,.08)"} />
        ))}
        <rect x={nut - 4} y={14} width={5} height={H - 28} rx={2} fill="#cbd5e1" opacity={0.55} />
        {STRINGS.map((s, i) => (
          <g key={s.name}>
            <line x1={nut - 46} x2={end + 6} y1={y(i)} y2={y(i)} stroke="#94a3b8" strokeOpacity={0.55} strokeWidth={1 + i * 0.55} />
            <text x={6} y={y(i) + 4.5} className="fb-string">
              {s.name}
            </text>
          </g>
        ))}
        {[3, 5, 7, 12].filter((n) => n <= maxOffset).map((n) => (
          <text key={n} x={x(n)} y={H - 2} textAnchor="middle" className="fb-pos">
            {n === 12 ? "octave" : `+${n}`}
          </text>
        ))}
        {cells.map((m) => {
          const p = violinPlace(m)!;
          const s = stats?.get(m);
          const cx = x(p.offset);
          const cy = y(p.string);
          const r = s ? 8 + 6 * Math.sqrt(s.count / maxCount) : compact ? 8 : 6;
          const isTarget = m === target;
          return (
            <g
              key={m}
              tabIndex={s ? 0 : -1}
              className="fb-cell"
              onMouseEnter={(e) => showTip(e, m, s)}
              onMouseLeave={() => setTip(null)}
              onFocus={(e) => showTip(e, m, s)}
              onBlur={() => setTip(null)}
              aria-label={`${noteLabel(m)} on the ${STRINGS[p.string].name} string${s ? `, average ${formatCents(s.mean, 1)} cents over ${s.count} notes` : ""}`}
            >
              <circle cx={cx} cy={cy} r={r} fill={s ? centsColor(s.mean) : "rgba(148,163,184,.12)"} stroke="#0b0f19" strokeWidth={2} />
              {isTarget && <circle cx={cx} cy={cy} r={r + 6} className="target-ring" />}
              {(s || highlight.includes(m)) && (
                <text x={cx} y={cy + 3.5} textAnchor="middle" className={s ? "fb-note on" : "fb-note"}>
                  {noteLabel(m).replace(/\d+$/, "")}
                </text>
              )}
            </g>
          );
        })}
        {isLive && (
          <>
            <circle ref={dot} r={8} opacity={0} className="live-dot" />
            <text ref={dotLabel} textAnchor="middle" opacity={0} className="live-dot-label" />
          </>
        )}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

// ---------------------------------------------------------------- piano

export function Keyboard({ stats, highlight = [], target = null, live: isLive = false, reference, ariaLabel }: CommonProps) {
  const notes = [...(stats?.keys() ?? []), ...highlight, ...(target !== null ? [target] : [])];
  // Whole octaves around the data, at least C3–B5.
  const lo = Math.min(48, ...notes.map((m) => m - pitchClass(m)));
  const hi = Math.max(83, ...notes.map((m) => m - pitchClass(m) + 11));
  const whites: number[] = [];
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);
  const KW = 22;
  const W = whites.length * KW;
  const H = 120;
  const whiteX = new Map(whites.map((m, i) => [m, i * KW]));
  const keyX = (m: number) => (isBlackKey(m) ? whiteX.get(m - 1)! + KW - 7 : whiteX.get(m)!);
  const [tip, setTip] = useState<Tip | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const marker = useRef<SVGRectElement>(null);
  const markerLabel = useRef<SVGTextElement>(null);

  useAnimationFrame(() => {
    if (!isLive || !marker.current) return;
    const m = live.state.display;
    const k = Math.round(m);
    if (!Number.isFinite(m) || k < lo || k > hi) {
      marker.current.setAttribute("opacity", "0");
      markerLabel.current?.setAttribute("opacity", "0");
      return;
    }
    const ref = reference?.() ?? k;
    const w = isBlackKey(k) ? 14 : KW;
    // The marker slides by the deviation: half a key's width at ±50 cents.
    const cx = keyX(k) + w / 2 + (m - k) * w;
    marker.current.setAttribute("x", (cx - 4).toFixed(1));
    marker.current.setAttribute("opacity", "1");
    marker.current.setAttribute("fill", centsColor((m - ref) * 100));
    if (markerLabel.current) {
      markerLabel.current.setAttribute("x", cx.toFixed(1));
      markerLabel.current.setAttribute("opacity", "1");
      setText(markerLabel.current, noteLabel(k));
    }
  });

  const showTip = (e: React.MouseEvent | React.FocusEvent, midi: number, s: NoteStat | undefined) => {
    const box = wrap.current!.getBoundingClientRect();
    const r = (e.currentTarget as Element).getBoundingClientRect();
    setTip({ x: r.left + r.width / 2 - box.left, y: r.top - box.top + 20, title: noteLabel(midi), lines: s ? describeStat(s) : ["not played yet"] });
  };

  const key = (m: number) => {
    const s = stats?.get(m);
    const black = isBlackKey(m);
    const x0 = keyX(m);
    const w = black ? 14 : KW;
    const h = black ? 66 : 104;
    const fill = black ? "#1a2030" : "#cfd6e2";
    return (
      <g
        key={m}
        tabIndex={s ? 0 : -1}
        className="kb-key"
        onMouseEnter={(e) => showTip(e, m, s)}
        onMouseLeave={() => setTip(null)}
        onFocus={(e) => showTip(e, m, s)}
        onBlur={() => setTip(null)}
        aria-label={`${noteLabel(m)}${s ? `, average ${formatCents(s.mean, 1)} cents over ${s.count} notes` : ""}`}
      >
        <rect x={x0 + 0.5} y={16} width={w - 1} height={h} rx={3} fill={fill} stroke="#0b0f19" />
        {s && <rect x={x0 + 3} y={16 + h - (black ? 20 : 26)} width={w - 6} height={black ? 16 : 22} rx={3} fill={centsColor(s.mean)} />}
        {highlight.includes(m) && !s && <circle cx={x0 + w / 2} cy={16 + h - 10} r={3} fill={black ? "#94a3b8" : "#475569"} />}
        {m === target && <rect x={x0 - 1.5} y={14.5} width={w + 3} height={h + 3} rx={4} className="target-ring" />}
        {!black && pitchClass(m) === 0 && (
          <text x={x0 + KW / 2} y={16 + h - (s ? 30 : 6)} textAnchor="middle" className="kb-c">
            C{octaveOf(m)}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="viz" ref={wrap}>
      <svg viewBox={`0 0 ${W} ${H + 8}`} className="keyboard" role="img" aria-label={ariaLabel} preserveAspectRatio="xMidYMid meet">
        {whites.map(key)}
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter(isBlackKey).map(key)}
        {isLive && (
          <>
            <rect ref={marker} y={4} width={8} height={8} rx={4} opacity={0} />
            <text ref={markerLabel} y={2} textAnchor="middle" opacity={0} className="live-dot-label" />
          </>
        )}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Legend for the diverging intonation scale. */
export function CentsLegend() {
  const stops = [-30, -20, -10, -3, 0, 3, 10, 20, 30];
  return (
    <div className="legend-scale" aria-label="Colour scale: cyan is flat, pale is in tune, amber is sharp">
      <span>♭ flat</span>
      <div className="legend-bar" style={{ background: `linear-gradient(90deg, ${stops.map((c) => centsColor(c)).join(", ")})` }} />
      <span>sharp ♯</span>
      <span className="legend-ticks mono">
        <i>−30¢</i>
        <i>0</i>
        <i>+30¢</i>
      </span>
    </div>
  );
}
