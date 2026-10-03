import { useLayoutEffect, useRef, useState } from "react";

interface Props {
  /** fork: one input to two lanes; join: two lanes to one output; line: straight through. */
  kind: "fork" | "join" | "line";
  /** Vertical gap between the two lane rows, so the ends meet each lane's centre. */
  gap?: number;
  colors: string[];
  /** Data is flowing (a query is active). */
  active: boolean;
  /** Changes on every new query, restarting the one-shot pulse. */
  pulseKey: string;
  /** Pulse delay in seconds, so stages light up in order. */
  delay: number;
}

/** A connector between pipeline stages, drawn to its own measured size. */
export default function Wire({ kind, gap = 0, colors, active, pulseKey, delay }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { w, h } = size;
  const mid = h / 2;
  const lane = [(h - gap) / 4, h - (h - gap) / 4];
  const curve = (y0: number, y1: number) => `M0 ${y0} C${w * 0.55} ${y0} ${w * 0.45} ${y1} ${w} ${y1}`;
  const paths = kind === "fork" ? lane.map((y) => curve(mid, y)) : kind === "join" ? lane.map((y) => curve(y, mid)) : [curve(mid, mid)];
  return (
    <div className="wire" ref={ref} aria-hidden>
      {w > 0 && (
        <svg width={w} height={h}>
          {paths.map((d, i) => (
            <g key={i} style={{ color: colors[i] ?? colors[0] }}>
              <path d={d} className="wire-base" />
              {active && <path d={d} className="wire-flow" />}
              {active && <path key={pulseKey} d={d} pathLength={100} className="wire-pulse" style={{ animationDelay: `${delay}s` }} />}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
