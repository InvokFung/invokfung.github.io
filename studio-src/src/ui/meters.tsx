import { useEffect, useRef } from "react";
import { formatCents, octaveOf, pitchName } from "../dsp/notes";
import { live } from "../state/app";
import { centsColor } from "./colors";
import { setText, useAnimationFrame } from "./hooks";

/**
 * Tuner readouts. Each one reads the live pitch every animation frame and
 * writes to the DOM directly, so a 60 fps needle costs no React renders.
 */

/** Cents against the reference (the locked note, or the nearest one), or NaN when silent. */
export function liveCents(reference: () => number | null): { cents: number; ref: number } {
  const m = live.state.display;
  if (!Number.isFinite(m)) return { cents: NaN, ref: NaN };
  const ref = reference() ?? Math.round(m);
  return { cents: (m - ref) * 100, ref };
}

const ARC = 66; // degrees either side of centre at ±50 cents
const CX = 200;
const CY = 214;
const R = 176;

function polar(deg: number, r: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function arcPath(from: number, to: number, r: number) {
  const [x0, y0] = polar(from, r);
  const [x1, y1] = polar(to, r);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

export function Gauge({ reference, compact = false }: { reference: () => number | null; compact?: boolean }) {
  const needle = useRef<SVGGElement>(null);
  const noteEl = useRef<SVGTextElement>(null);
  const accEl = useRef<SVGTSpanElement>(null);
  const octEl = useRef<SVGTSpanElement>(null);
  const centsEl = useRef<SVGTextElement>(null);
  const hzEl = useRef<SVGTextElement>(null);
  const zone = useRef<SVGPathElement>(null);
  const angle = useRef(0);
  const meterRef = useRef<SVGSVGElement>(null);
  const lastAria = useRef(0);
  const heard = useRef(false);

  useAnimationFrame((dt, now) => {
    const { cents, ref } = liveCents(reference);
    const on = Number.isFinite(cents);
    const clamped = on ? Math.max(-50, Math.min(50, cents)) : 0;
    const goal = (clamped / 50) * ARC;
    // The value is already smoothed; this only eases the needle back to centre when the sound stops.
    angle.current += (goal - angle.current) * (on ? 1 : Math.min(1, dt * 4));
    needle.current?.setAttribute("transform", `rotate(${angle.current.toFixed(2)} ${CX} ${CY})`);
    needle.current?.setAttribute("opacity", on ? "1" : "0.35");
    const inTune = on && Math.abs(cents) <= 5;
    zone.current?.setAttribute("opacity", inTune ? "0.9" : "0.35");
    if (needle.current) needle.current.style.color = on ? centsColor(cents) : "#64748b";
    if (on) heard.current = true;
    // No placeholder glyph before the first note; afterwards the last note stays, dimmed.
    noteEl.current?.setAttribute("opacity", on ? "1" : heard.current ? "0.3" : "0");
    if (on) {
      const name = pitchName(ref);
      setText(noteEl.current?.firstChild as Element | null, name[0]);
      setText(accEl.current, name.slice(1));
      setText(octEl.current, String(octaveOf(ref)));
      // The octave sits just below the letter's baseline; an empty accidental tspan takes no dy, so compensate.
      octEl.current?.setAttribute("dy", name.length > 1 ? "32" : "6");
      setText(centsEl.current, Math.abs(cents) > 50 ? `${formatCents(cents)}¢ ${cents > 0 ? "· tune down" : "· tune up"}` : `${formatCents(cents, 1)}¢`);
      setText(hzEl.current, `${live.state.freq.toFixed(2)} Hz`);
      centsEl.current?.setAttribute("fill", centsColor(cents));
    } else {
      setText(centsEl.current, "—");
      centsEl.current?.setAttribute("fill", "#6b7586");
      setText(hzEl.current, live.state.count ? "listening…" : "no input");
    }
    // Screen readers: an occasional update, not 60 per second.
    if (now - lastAria.current > 700 && meterRef.current) {
      lastAria.current = now;
      meterRef.current.setAttribute("aria-valuenow", on ? cents.toFixed(0) : "0");
      meterRef.current.setAttribute("aria-valuetext", on ? `${pitchName(ref)}${octaveOf(ref)}, ${formatCents(cents)} cents` : "no pitch");
    }
  });

  const ticks = [];
  for (let c = -50; c <= 50; c += 5) {
    const major = c % 25 === 0;
    const [x0, y0] = polar((c / 50) * ARC, R - (major ? 20 : c % 10 === 0 ? 13 : 8));
    const [x1, y1] = polar((c / 50) * ARC, R);
    ticks.push(<line key={c} x1={x0} y1={y0} x2={x1} y2={y1} className={major ? "tick major" : "tick"} />);
    if (major) {
      const [lx, ly] = polar((c / 50) * ARC, R + 15);
      ticks.push(
        <text key={`l${c}`} x={lx} y={ly + 4} textAnchor="middle" className="tick-label">
          {c > 0 ? `+${c}` : c}
        </text>,
      );
    }
  }

  return (
    <svg
      ref={meterRef}
      className={`gauge${compact ? " compact" : ""}`}
      viewBox="0 0 400 250"
      role="meter"
      aria-label="Tuning gauge in cents"
      aria-valuemin={-50}
      aria-valuemax={50}
      aria-valuenow={0}
    >
      <defs>
        <linearGradient id="g-track" x1="0" x2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="0.5" stopColor="#cbd5e1" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <filter id="g-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <path d={arcPath(-ARC, ARC, R + 2)} className="g-track" stroke="url(#g-track)" />
      <path ref={zone} d={arcPath(-ARC / 10, ARC / 10, R - 10)} className="g-zone" />
      {ticks}
      <text x={CX - R + 6} y={CY + 24} className="g-side">
        ♭ flat
      </text>
      <text x={CX + R - 6} y={CY + 24} className="g-side" textAnchor="end">
        sharp ♯
      </text>
      <text ref={noteEl} x={CX} y={CY - 70} textAnchor="middle" className="g-note">
        –<tspan ref={accEl} className="g-acc" dy={-26} />
        <tspan ref={octEl} className="g-oct" dy={6} />
      </text>
      <text ref={centsEl} x={CX} y={CY - 28} textAnchor="middle" className="g-cents mono">
        —
      </text>
      <text ref={hzEl} x={CX} y={CY - 6} textAnchor="middle" className="g-hz mono">
        no input
      </text>
      <g ref={needle} opacity={0.35}>
        <line x1={CX} y1={CY - R + 4} x2={CX} y2={CY - R + 46} className="g-needle-glow" filter="url(#g-glow)" />
        <line x1={CX} y1={CY - R + 4} x2={CX} y2={CY - R + 46} className="g-needle" />
      </g>
    </svg>
  );
}

/**
 * A strobe band, as on a strobe tuner: the stripes drift at a speed
 * proportional to the error (right when sharp, left when flat) and stand
 * still when the note is in tune. Three rows move at 1×, 2× and 4×, like the
 * octave rings of a mechanical strobe.
 */
export function Strobe({ reference }: { reference: () => number | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const offsets = useRef([0, 0, 0]);
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useAnimationFrame((dt) => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const { cents } = liveCents(reference);
    const on = Number.isFinite(cents);
    // 4 px/s per cent on the slowest row; clamp so a wild note doesn't strobe.
    const v = on && !reduced.current ? Math.max(-240, Math.min(240, cents * 4)) : 0;
    const rows = 3;
    const rh = h / rows;
    const color = on ? centsColor(cents) : "#334155";
    for (let r = 0; r < rows; r++) {
      const period = 28 / (r + 1) + 10;
      offsets.current[r] = (offsets.current[r] + v * 2 ** r * dt) % period;
      g.fillStyle = color;
      g.globalAlpha = on ? 0.85 - r * 0.18 : 0.35;
      for (let x = -period + offsets.current[r]; x < w + period; x += period) g.fillRect(x, r * rh + 2, period / 2, rh - 4);
    }
    g.globalAlpha = 1;
  });

  return (
    <div className="strobe">
      <canvas ref={canvas} aria-hidden="true" />
      <div className="strobe-labels" aria-hidden="true">
        <span>◂ flat</span>
        <span>still = in tune</span>
        <span>sharp ▸</span>
      </div>
    </div>
  );
}

/** Input level and clarity, so a player can see the mic is hearing them. */
export function LevelMeter() {
  const bar = useRef<HTMLDivElement>(null);
  const clarity = useRef<HTMLDivElement>(null);
  const db = useRef<HTMLSpanElement>(null);
  const peak = useRef(0);
  useAnimationFrame((dt) => {
    const s = live.state;
    peak.current = Math.max(s.level, peak.current - dt * 0.8);
    if (bar.current) bar.current.style.transform = `scaleX(${peak.current.toFixed(3)})`;
    if (clarity.current) clarity.current.style.transform = `scaleX(${(s.pitched ? s.clarity : s.clarity * 0.5).toFixed(3)})`;
    setText(db.current, s.count ? `${Math.max(-99, s.db).toFixed(0)} dBFS · clarity ${s.clarity.toFixed(2)}` : "—");
  });
  return (
    <div className="meters">
      <div className="meter-row">
        <span>Level</span>
        <div className="meter">
          <div ref={bar} className="meter-fill level" />
        </div>
      </div>
      <div className="meter-row">
        <span>Clarity</span>
        <div className="meter">
          <div ref={clarity} className="meter-fill clarity" />
        </div>
      </div>
      <span ref={db} className="mono muted meter-value">
        —
      </span>
    </div>
  );
}
