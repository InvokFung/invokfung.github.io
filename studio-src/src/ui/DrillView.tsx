import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCents, noteLabel } from "../dsp/notes";
import { SYLLABUS, buildDrill, drillTitle, prettyTonic, type DrillSpec, type ScaleForm, type SyllabusKey } from "../dsp/theory";
import { summariseDrill, type DrillState, type NoteResult } from "../state/drill";
import { app, beginDrill, closeDrill, live, navigate, nextDemoDrill, replayGuide, skipNote, stopDrill, updateSettings } from "../state/app";
import { useStore } from "../state/store";
import { centsColor, WRONG } from "./colors";
import { setText, useAnimationFrame, useMediaQuery } from "./hooks";
import { Card, InstrumentSwitch, LiveInstrument, PracticeStage, Segmented, StartOverlay } from "./practice";
import { Fingerboard, Keyboard } from "./instruments";
import type { NoteStat } from "../state/history";
import { LevelMeter } from "./meters";

const RATING_TEXT = { "in-tune": "in tune", close: "close", sharp: "sharp", flat: "flat" } as const;

const describeResult = (r: NoteResult) => `${r.label}: ${formatCents(r.cents)} cents, ${RATING_TEXT[r.rating]}`;

// ---------------------------------------------------------------- picker

function formsFor(k: SyllabusKey): { v: ScaleForm; label: string }[] {
  return k.mode === "major"
    ? [
        { v: "scale", label: "Scale" },
        { v: "arpeggio", label: "Arpeggio" },
      ]
    : [
        { v: "harmonic", label: "Harmonic" },
        { v: "melodic", label: "Melodic" },
        { v: "arpeggio", label: "Arpeggio" },
      ];
}

function Picker() {
  const instrument = useStore(app, (s) => s.settings.instrument);
  const grade = useStore(app, (s) => s.settings.grade);
  const guide = useStore(app, (s) => s.settings.guide);
  const source = useStore(app, (s) => s.source);
  const keys = SYLLABUS[instrument][grade - 1];
  const [keyIndex, setKeyIndex] = useState(0);
  const [form, setForm] = useState<ScaleForm>("scale");
  const k = keys[Math.min(keyIndex, keys.length - 1)];
  const forms = formsFor(k);
  const chosenForm = forms.some((f) => f.v === form) ? form : forms[0].v;
  const spec: DrillSpec = { instrument, tonic: k.tonic, mode: k.mode, form: chosenForm, octaves: k.octaves };
  const notes = useMemo(() => buildDrill(spec), [spec.instrument, spec.tonic, spec.mode, spec.form, spec.octaves]);

  return (
    <Card title="Choose a drill" aside={<InstrumentSwitch />}>
      <span className="field-label" id="grade-label">
        Grade
      </span>
      <div className="grades" role="radiogroup" aria-labelledby="grade-label">
        {SYLLABUS[instrument].map((_, i) => (
          <button
            key={i}
            role="radio"
            aria-checked={grade === i + 1}
            className={grade === i + 1 ? "on" : ""}
            onClick={() => {
              updateSettings({ grade: i + 1 });
              setKeyIndex(0);
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <span className="field-label" id="key-label">
        Key · octaves
      </span>
      <div className="chips keys" role="radiogroup" aria-labelledby="key-label">
        {keys.map((key, i) => (
          <button key={`${key.tonic}${key.mode}`} role="radio" aria-checked={i === keyIndex} className={`chip-btn${i === keyIndex ? " on" : ""}`} onClick={() => setKeyIndex(i)}>
            {prettyTonic(key.tonic)} {key.mode === "major" ? "maj" : "min"} <span className="muted">· {key.octaves}</span>
          </button>
        ))}
      </div>
      <span className="field-label">Form</span>
      <Segmented<ScaleForm> label="Form" value={chosenForm} options={forms} onChange={setForm} />
      <label className="switch">
        <input type="checkbox" checked={guide} onChange={(e) => updateSettings({ guide: e.target.checked })} />
        <span className="switch-track" aria-hidden="true" />
        <span>
          Play each note first <span className="muted">(call and response)</span>
        </span>
      </label>
      <div className="picked">
        <b>{drillTitle(spec)}</b>
        <span className="muted mono picked-notes">{notes.map((n) => n.label).join(" ")}</span>
      </div>
      <button className="btn primary wide" disabled={!source} onClick={() => beginDrill(spec)}>
        {source ? `Start · ${notes.length} notes` : "Start listening first"}
      </button>
      {source === "demo" && <p className="muted card-note">In the demo, the synthesized violinist answers each guide tone.</p>}
    </Card>
  );
}

// ---------------------------------------------------------------- running

function NoteLane({ drill }: { drill: DrillState }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = list.current?.children[drill.index] as HTMLElement | undefined;
    const box = list.current;
    if (!el || !box) return;
    box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [drill.index]);
  return (
    <ol className="lane" ref={list} aria-label="Notes in this drill">
      {drill.notes.map((n, i) => {
        const r = drill.results.find((x) => x.index === i);
        const current = i === drill.index && drill.phase !== "done";
        const state = r ? r.rating : current ? "current" : i < drill.index ? "skipped" : "todo";
        return (
          <li key={i} className={`lane-note ${state}`} aria-current={current ? "step" : undefined} style={r ? { borderColor: centsColor(r.cents), color: centsColor(r.cents) } : undefined}>
            <span className="lane-label">{n.label}</span>
            <span className="lane-cents mono">{r ? `${formatCents(r.cents)}¢` : current ? "now" : i < drill.index ? "skip" : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

function DrillHead({ drill }: { drill: DrillState }) {
  return (
    <div className="drill-head">
      <div>
        <h1 className="drill-title">{drill.title}</h1>
        <span className="muted">
          {drill.spec.instrument === "violin" ? "Violin" : "Piano"} · {drill.results.length}/{drill.notes.length} notes
          {drill.wrong ? ` · ${drill.wrong} wrong` : ""}
          {drill.source === "demo" ? " · demo violinist" : ""}
        </span>
      </div>
      <div className="drill-actions">
        <button className="ghost small" onClick={replayGuide}>
          Hear it again
        </button>
        <button className="ghost small" onClick={skipNote}>
          Skip note
        </button>
        <button className="ghost small" onClick={stopDrill}>
          Stop
        </button>
      </div>
      <div className="progress-line" aria-hidden="true">
        <div style={{ width: `${(100 * drill.index) / drill.notes.length}%` }} />
      </div>
    </div>
  );
}

function NowCard({ drill }: { drill: DrillState }) {
  const target = drill.notes[Math.min(drill.index, drill.notes.length - 1)];
  const heard = useRef<HTMLSpanElement>(null);
  const cents = useRef<HTMLSpanElement>(null);
  useAnimationFrame(() => {
    const m = live.state.display;
    if (!Number.isFinite(m)) {
      setText(heard.current, "—");
      setText(cents.current, "");
      return;
    }
    const d = (m - target.midi) * 100;
    setText(heard.current, noteLabel(Math.round(m)));
    setText(cents.current, Math.abs(d) < 100 ? `${formatCents(d)}¢` : "");
    if (cents.current) cents.current.style.color = centsColor(d);
  });
  const last = drill.results[drill.results.length - 1];
  const phaseText = drill.phase === "cue" ? "Listen…" : drill.phase === "lead-in" ? "Get ready" : "Your turn";
  return (
    <Card title="Now">
      <div className="now">
        <div className="now-target">
          <span className={`now-phase ${drill.phase}`}>{phaseText}</span>
          <span className="now-note">{target.label}</span>
          <span className="muted">
            note {Math.min(drill.index + 1, drill.notes.length)} of {drill.notes.length}
          </span>
        </div>
        <div className="now-heard">
          <span className="muted">Hearing</span>
          <span ref={heard} className="now-heard-note mono">
            —
          </span>
          <span ref={cents} className="mono now-heard-cents" />
        </div>
      </div>
      {drill.lastWrong && (
        <p className="wrong" role="status" style={{ color: WRONG }}>
          Heard {drill.lastWrong.heard}, expected {drill.lastWrong.expected}.
        </p>
      )}
      {last && (
        <p className="last">
          Last: <b>{last.label}</b>{" "}
          <span className="mono" style={{ color: centsColor(last.cents) }}>
            {formatCents(last.cents, 1)}¢
          </span>{" "}
          · {RATING_TEXT[last.rating]}
          {last.vibrato ? ` · vibrato ${last.vibrato.rate.toFixed(1)} Hz ±${last.vibrato.depth.toFixed(0)}¢` : ""}
        </p>
      )}
      <LevelMeter />
    </Card>
  );
}

/** Announces each scored note to screen readers. */
function Announcer({ drill }: { drill: DrillState | null }) {
  const last = drill?.results[drill.results.length - 1];
  return (
    <div className="sr-only" aria-live="polite">
      {last ? describeResult(last) : ""}
    </div>
  );
}

// ---------------------------------------------------------------- summary

function NoteChart({ results }: { results: NoteResult[] }) {
  const bw = 22;
  const H = 168;
  const mid = 76;
  const scale = 1.6; // px per cent, clamped at ±40
  const narrow = useMediaQuery("(max-width: 600px)");
  const W = Math.max(narrow ? 340 : 640, results.length * bw + 44);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="chart-scroll">
      <svg className="note-chart" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: Math.min(W, results.length * 16 + 44) }} role="img" aria-label="Deviation of each note in cents">
        <rect x={36} y={mid - 5 * scale} width={W - 40} height={10 * scale} className="tune-band" />
        {[-40, -20, 0, 20, 40].map((c) => (
          <g key={c}>
            <line x1={36} x2={W - 4} y1={mid - c * scale} y2={mid - c * scale} className={c === 0 ? "axis zero" : "axis"} />
            <text x={30} y={mid - c * scale + 3.5} textAnchor="end" className="axis-label">
              {c > 0 ? `+${c}` : c}
            </text>
          </g>
        ))}
        {results.map((r, i) => {
          const c = Math.max(-40, Math.min(40, r.cents));
          const x = 40 + i * bw;
          const h = Math.max(2, Math.abs(c) * scale);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)} aria-label={describeResult(r)}>
              <rect x={x} y={14} width={bw} height={H - 40} fill="transparent" />
              <rect x={x + 4} y={c >= 0 ? mid - h : mid} width={bw - 8} height={h} rx={3} fill={centsColor(r.cents)} opacity={hover === null || hover === i ? 1 : 0.45} />
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="bar-label">
                {r.label.replace(/\d+$/, "")}
              </text>
            </g>
          );
        })}
        {hover !== null && results[hover] && (
          <g className="chart-tip" transform={`translate(${Math.min(W - 150, Math.max(40, 40 + hover * bw - 60))}, 2)`}>
            <rect width={146} height={24} rx={6} />
            <text x={8} y={16}>
              {results[hover].label} {formatCents(results[hover].cents, 1)}¢ · drift {results[hover].drift.toFixed(1)}¢
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/** Per-note averages for one drill (notes played twice, up and down, are averaged). */
function drillStats(drill: DrillState): Map<number, NoteStat> {
  const m = new Map<number, NoteStat>();
  for (const r of drill.results) {
    const s = m.get(r.midi) ?? { midi: r.midi, count: 0, mean: 0, meanAbs: 0 };
    s.mean = (s.mean * s.count + r.cents) / (s.count + 1);
    s.meanAbs = (s.meanAbs * s.count + Math.abs(r.cents)) / (s.count + 1);
    s.count++;
    m.set(r.midi, s);
  }
  return m;
}

function ScoreRing({ score }: { score: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg className="score-ring" viewBox="0 0 120 120" role="img" aria-label={`Score ${score} out of 100`}>
      <defs>
        <linearGradient id="ring-g" x1="0" x2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="0.6" stopColor="#06b6d4" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <circle cx={60} cy={60} r={r} className="ring-track" />
      <circle cx={60} cy={60} r={r} className="ring-value" stroke="url(#ring-g)" strokeDasharray={`${(c * score) / 100} ${c}`} transform="rotate(-90 60 60)" />
      <text x={60} y={66} textAnchor="middle" className="ring-text">
        {score}
      </text>
    </svg>
  );
}

function Summary({ drill }: { drill: DrillState }) {
  const s = summariseDrill(drill);
  const narrow = useMediaQuery("(max-width: 600px)");
  const seconds = Math.max(0, (drill.endedAt ?? drill.startedAt) - drill.startedAt);
  const tendency = Math.abs(s.meanSigned) < 2 ? "centred" : s.meanSigned > 0 ? "leans sharp" : "leans flat";
  return (
    <div className="summary">
      <div className="summary-head">
        <ScoreRing score={s.score} />
        <div>
          <span className="eyebrow">Drill complete{drill.source === "demo" ? " · demo violinist" : ""}</span>
          <h1 className="drill-title">{drill.title}</h1>
          <p className="muted">
            {s.inTune} of {s.played} notes within ±10¢ · {Math.round(seconds)} s
          </p>
        </div>
      </div>
      <dl className="stats">
        <div>
          <dt>Average miss</dt>
          <dd className="mono">±{s.meanAbs.toFixed(1)}¢</dd>
        </div>
        <div>
          <dt>Tendency</dt>
          <dd className="mono" style={{ color: centsColor(s.meanSigned) }}>
            {formatCents(s.meanSigned, 1)}¢ <small>{tendency}</small>
          </dd>
        </div>
        <div>
          <dt>Drift (vibrato removed)</dt>
          <dd className="mono">{s.drift.toFixed(1)}¢</dd>
        </div>
        <div>
          <dt>Vibrato</dt>
          <dd className="mono">{s.vibrato ? `${s.vibrato.rate.toFixed(1)} Hz ±${s.vibrato.depth.toFixed(0)}¢` : "none"}</dd>
        </div>
        <div>
          <dt>Wrong notes</dt>
          <dd className="mono">{drill.wrong}</dd>
        </div>
        <div>
          <dt>Most off</dt>
          <dd className="mono">{s.worst ? `${s.worst.label} ${formatCents(s.worst.cents)}¢` : "–"}</dd>
        </div>
      </dl>
      <h2 className="section-label">Each note, in cents</h2>
      <NoteChart results={drill.results} />
      <div className="summary-board">
        <h2 className="section-label">Where it happened</h2>
        {drill.spec.instrument === "violin" ? (
          <Fingerboard compact={narrow} stats={drillStats(drill)} ariaLabel="This drill's notes on the fingerboard, coloured by deviation" />
        ) : (
          <Keyboard stats={drillStats(drill)} ariaLabel="This drill's notes on the keyboard, coloured by deviation" />
        )}
      </div>
      <div className="summary-actions">
        <button className="btn primary" onClick={() => beginDrill(drill.spec)}>
          Again
        </button>
        {drill.source === "demo" && (
          <button className="btn ghost" onClick={nextDemoDrill}>
            Next demo drill
          </button>
        )}
        <button className="btn ghost" onClick={closeDrill}>
          Choose another
        </button>
        <button className="btn ghost" onClick={() => navigate("progress")}>
          See progress →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- view

export default function DrillView() {
  const drill = useStore(app, (s) => s.drill);
  const running = drill && drill.phase !== "done";
  const target = running ? drill.notes[drill.index]?.midi ?? null : null;
  const reference = useCallback(() => {
    const d = app.get().drill;
    return d && d.phase !== "done" ? d.notes[d.index]?.midi ?? null : null;
  }, []);
  const highlight = useMemo(() => (drill ? [...new Set(drill.notes.map((n) => n.midi))] : []), [drill?.id]);

  return (
    <main className="practice" id="main">
      <section className="stage-col glass" aria-label="Drill">
        {drill?.phase === "done" ? (
          <Summary drill={drill} />
        ) : (
          <>
            {drill ? (
              <>
                <DrillHead drill={drill} />
                <NoteLane drill={drill} />
              </>
            ) : (
              <div className="drill-head empty">
                <div>
                  <h1 className="drill-title">Scales and arpeggios</h1>
                  <span className="muted">Pick a drill on the right. Each note is scored on its median pitch and how steady it was.</span>
                </div>
              </div>
            )}
            <div className="stage-wrap">
              <PracticeStage />
              <StartOverlay />
            </div>
          </>
        )}
      </section>
      <aside className="side">
        {running ? (
          <>
            <NowCard drill={drill} />
            <Card title="On the instrument">
              <LiveInstrument target={target} highlight={highlight} reference={reference} />
            </Card>
          </>
        ) : (
          <Picker />
        )}
      </aside>
      <Announcer drill={drill} />
    </main>
  );
}
