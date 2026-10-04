import type { RefObject } from "react";

export const SPEEDS = [5, 25, 100, 400];

export interface DockProps {
  layer: number;
  received: number;
  total: number;
  z: number;
  playing: boolean;
  speed: number;
  mode: "preview" | "model";
  ghost: boolean;
  hint: boolean;
  clockRef: RefObject<HTMLSpanElement | null>;
  totalTime: string | null;
  onLayer(l: number): void;
  onPlay(): void;
  onSpeed(s: number): void;
  onMode(m: "preview" | "model"): void;
  onGhost(): void;
}

export default function Dock(p: DockProps) {
  const max = Math.max(0, p.total - 1);
  const can = p.received > 0;
  const recvPct = p.total ? (p.received / p.total) * 100 : 0;
  const pos = max ? (Math.min(p.layer, max) / max) * 100 : 0;
  return (
    <div className="dock" role="group" aria-label="Layer preview controls">
      <button
        className={`play${p.hint && !p.playing ? " hint" : ""}`}
        onClick={p.onPlay}
        disabled={!can}
        aria-label={p.playing ? "Pause the nozzle" : "Play the nozzle along the toolpaths"}
        title={p.playing ? "Pause (Space)" : "Play (Space)"}
      >
        {p.playing ? (
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M8 5h3v14H8zM13 5h3v14h-3z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        )}
      </button>
      <label className="speed" title="Playback speed relative to the real print">
        <span className="sr-only">Playback speed</span>
        <select value={p.speed} onChange={(e) => p.onSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>

      <div className="scrub">
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={Math.min(p.layer, max)}
          disabled={!can}
          aria-label="Layer"
          aria-valuetext={`Layer ${p.layer + 1} of ${p.total}, z ${p.z.toFixed(2)} millimetres`}
          style={{ ["--recv" as string]: `${recvPct}%`, ["--pos" as string]: `${pos}%` }}
          onChange={(e) => p.onLayer(Math.min(Number(e.target.value), Math.max(0, p.received - 1)))}
        />
        <div className="readout mono">
          <span>
            <b>L {p.total ? p.layer + 1 : 0}</b>
            <span className="muted">/{p.total}</span>
          </span>
          <span>
            z <b>{p.z.toFixed(2)}</b>
            <span className="muted"> mm</span>
          </span>
          <span title="Estimated print time at the nozzle">
            <span ref={p.clockRef}>0:00:00</span>
            {p.totalTime && <span className="muted"> / {p.totalTime}</span>}
          </span>
        </div>
      </div>

      <div className="seg" role="radiogroup" aria-label="View">
        {(["preview", "model"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={p.mode === m} className={p.mode === m ? "on" : ""} onClick={() => p.onMode(m)}>
            {m === "preview" ? "Toolpaths" : "Model"}
          </button>
        ))}
      </div>
      <button className={`toggle${p.ghost ? " on" : ""}`} aria-pressed={p.ghost} onClick={p.onGhost} title="Show the model above the section plane">
        Ghost
      </button>
    </div>
  );
}
