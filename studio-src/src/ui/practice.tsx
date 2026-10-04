import { useCallback, useRef, type ReactNode } from "react";
import Stage, { type StageFocus } from "../stage/LazyStage";
import { A4_MAX, A4_MIN } from "../dsp/notes";
import type { Instrument } from "../dsp/theory";
import { app, engine, live, updateSettings } from "../state/app";
import { useStore } from "../state/store";
import { StartButtons } from "./Header";
import { Fingerboard, Keyboard } from "./instruments";

/** The live pitch stage, focused on the drill's target, the tuner's locked string, or whatever is sounding. */
export function PracticeStage() {
  const lastCentre = useRef(app.get().settings.instrument === "piano" ? 60 : 69);
  const focus = useCallback((): StageFocus => {
    const s = app.get();
    const L = live.state;
    const d = s.drill && s.drill.phase !== "done" ? s.drill : null;
    const note = d ? d.notes[Math.min(d.index, d.notes.length - 1)] : null;
    const target = note ? note.midi : s.view === "tuner" ? s.tunerLock : null;
    if (target === null && Number.isFinite(L.display)) lastCentre.current = Math.round(L.display);
    const info = engine.info;
    // Frames are stamped at the centre of their analysis window, half a window behind the clock.
    const lag = info ? info.window / 2 / info.sampleRate + 0.004 : 0.015;
    return {
      center: target ?? lastCentre.current,
      target,
      targetLabel: note?.label,
      now: engine.running ? engine.now - lag : L.t,
      sounding: L.display,
      level: L.level,
      a4: s.settings.a4,
    };
  }, []);
  return <Stage trace={live.trace} focus={focus} ariaLabel="Live pitch: a ribbon of recent pitch against one line per semitone; the target note's line vibrates while you play near it." />;
}

export function StartOverlay() {
  const source = useStore(app, (s) => s.source);
  const error = useStore(app, (s) => s.error);
  if (source) return null;
  return (
    <div className="start-overlay">
      <p>Nothing is listening yet.</p>
      <StartButtons compact />
      {error && (
        <p className="alert small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Card({ title, children, className = "", aside }: { title: string; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={`card glass ${className}`}>
      <div className="card-head">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={value === o.v} className={value === o.v ? "on" : ""} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function InstrumentSwitch() {
  const instrument = useStore(app, (s) => s.settings.instrument);
  return (
    <Segmented<Instrument>
      label="Instrument"
      value={instrument}
      onChange={(v) => updateSettings({ instrument: v })}
      options={[
        { v: "violin", label: "Violin" },
        { v: "piano", label: "Piano" },
      ]}
    />
  );
}

const A4_PRESETS = [
  { v: 415, label: "415 baroque" },
  { v: 440, label: "440" },
  { v: 442, label: "442" },
  { v: 443, label: "443" },
];

export function A4Control() {
  const a4 = useStore(app, (s) => s.settings.a4);
  return (
    <div className="a4-control">
      <label htmlFor="a4-range" className="field-label">
        Reference A4 <span className="mono a4-value">{a4} Hz</span>
      </label>
      <input id="a4-range" type="range" min={A4_MIN} max={A4_MAX} step={1} value={a4} onChange={(e) => updateSettings({ a4: Number(e.target.value) })} aria-valuetext={`${a4} hertz`} />
      <div className="chips" role="group" aria-label="Common reference pitches">
        {A4_PRESETS.map((p) => (
          <button key={p.v} className={`chip-btn${a4 === p.v ? " on" : ""}`} onClick={() => updateSettings({ a4: p.v })}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The fingerboard or keyboard, following the live pitch. */
export function LiveInstrument({ target = null, highlight, reference }: { target?: number | null; highlight?: number[]; reference: () => number | null }) {
  const instrument = useStore(app, (s) => s.settings.instrument);
  return instrument === "violin" ? (
    <Fingerboard live compact target={target} highlight={highlight} reference={reference} ariaLabel="Violin fingerboard showing where the sounding note is played" />
  ) : (
    <Keyboard live target={target} highlight={highlight} reference={reference} ariaLabel="Piano keyboard showing the sounding key" />
  );
}

export function EngineFacts() {
  const info = useStore(app, (s) => s.engine);
  if (!info) return <p className="muted small-print">Start listening to see the audio settings.</p>;
  return (
    <dl className="facts mono">
      <div>
        <dt>Sample rate</dt>
        <dd>{(info.sampleRate / 1000).toFixed(1)} kHz</dd>
      </div>
      <div>
        <dt>Window</dt>
        <dd>
          {info.window} · {((info.window / info.sampleRate) * 1000).toFixed(1)} ms
        </dd>
      </div>
      <div>
        <dt>Hop</dt>
        <dd>
          {info.hop} · {((info.hop / info.sampleRate) * 1000).toFixed(1)} ms
        </dd>
      </div>
      <div>
        <dt>Output latency</dt>
        <dd>{info.outputLatency ? `${(info.outputLatency * 1000).toFixed(0)} ms` : "n/a"}</dd>
      </div>
    </dl>
  );
}
