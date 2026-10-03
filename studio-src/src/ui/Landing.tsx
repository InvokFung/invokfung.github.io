import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import metrics from "../generated/metrics.json";
import Stage, { type StageFocus } from "../stage/LazyStage";
import { app, dismissError } from "../state/app";
import { useStore } from "../state/store";
import { CentsLegend } from "./instruments";
import { SOURCE_URL, StartButtons } from "./Header";
import { buildIllustration, type Illustration } from "./illustration";

interface BuildInfo {
  js: { raw: number; gzip: number };
  entry?: { raw: number; gzip: number };
  css: { raw: number; gzip: number };
  worklets: { raw: number; gzip: number };
  builtAt: string;
}

const kb = (b: number) => `${(b / 1000).toFixed(0)} kB`;
const sweep = (id: string) => metrics.sweeps.find((s) => s.id === id)!;

function useBuildInfo() {
  const [info, setInfo] = useState<BuildInfo | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${import.meta.env.BASE_URL}build-info.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: BuildInfo | null) => live && setInfo(j))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return info;
}

/** The hero picture: a phrase from the synthesized violin, as the detector heard it. Draws itself in once. */
function HeroTrace() {
  const [ill, setIll] = useState<Illustration | null>(null);
  const [runId, setRunId] = useState(0);
  const t0 = useRef(performance.now());
  useEffect(() => {
    // Let the page paint first; the synthesis + analysis takes a few tens of ms.
    const id = setTimeout(() => setIll(buildIllustration()), 60);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    t0.current = performance.now();
  }, [runId, ill]);
  const focus = useCallback((): StageFocus => {
    if (!ill) return { center: 77.5, target: null, now: 0, sounding: NaN, level: 0, a4: 440 };
    const now = Math.min(ill.end + 0.25, ill.start - 0.2 + (performance.now() - t0.current) / 1000);
    const at = now <= ill.end ? ill.at(now) : { midi: NaN, level: 0 };
    return { center: ill.centre, target: null, now, sounding: at.midi, level: at.level, a4: 440 };
  }, [ill]);
  return (
    <figure className="hero-figure glass">
      {ill ? (
        <Stage key={runId} trace={ill.trace} focus={focus} ariaLabel="Pitch trace of a short violin phrase: two notes drift off pitch, one sharp and one flat." />
      ) : (
        <div className="stage stage-loading" />
      )}
      <figcaption>
        <div>
          <b>A phrase on the synthesized violin, as the detector heard it.</b> Rendered and analysed in your browser when this page loaded. Ribbon width is
          loudness; the wave is vibrato; F♯5 was played sharp and E5 flat.
        </div>
        <div className="figcaption-row">
          <CentsLegend />
          <button className="ghost small" onClick={() => setRunId((n) => n + 1)} aria-label="Replay the trace">
            ↻ Replay
          </button>
        </div>
      </figcaption>
    </figure>
  );
}

function Demonstrates() {
  const timing = metrics.timing.find((t) => t.profile === "violin")!;
  const items = [
    {
      k: "Real-time DSP",
      v: "AudioWorklet",
      d: `McLeod pitch method written from scratch on an FFT autocorrelation. ${timing.mpmUs} µs per frame, every ${metrics.hopMs} ms, off the main thread.`,
    },
    {
      k: "Accuracy",
      v: `${sweep("saw-violin").mpm.max}¢`,
      d: "Worst error on harmonic-rich tones across the violin range. Listeners start to notice errors of roughly 5–10¢.",
    },
    {
      k: "Robustness",
      v: `${sweep("snr5").mpm.gross + sweep("snr5").mpm.missed} / ${sweep("snr5").mpm.n}`,
      d: `Octave errors or dropouts at 5 dB signal-to-noise. YIN on the same frames: ${sweep("snr5").yin.gross + sweep("snr5").yin.missed}.`,
    },
    {
      k: "Music logic",
      v: "8 grades",
      d: "Note segmentation, vibrato-aware scoring, scales and arpeggios spelled correctly in every key.",
    },
    {
      k: "Interactive 3D",
      v: "R3F + GLSL",
      d: "The pitch ribbon and a target string that beats at the real |f − f₀|, rendered from shaders.",
    },
  ];
  return (
    <section className="section" aria-labelledby="demonstrates">
      <h2 id="demonstrates" className="section-label">
        What this demonstrates
      </h2>
      <div className="demo-strip">
        {items.map((i) => (
          <div key={i.k} className="strip-item glass">
            <span className="strip-k">{i.k}</span>
            <span className="strip-v mono">{i.v}</span>
            <span className="strip-d">{i.d}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Measured() {
  const build = useBuildInfo();
  const t = metrics.timing;
  const rows = metrics.sweeps.filter((s) => s.id !== "snr0");
  return (
    <section className="section" aria-labelledby="measured">
      <h2 id="measured" className="section-label">
        Measured, not claimed
      </h2>
      <div className="numbers">
        <Num v={`${metrics.tests.passed}/${metrics.tests.total}`} k="unit tests passing" d="node:test, run by the metrics script that writes these numbers" />
        <Num v={`${sweep("sine-piano").mpm.max}¢`} k="max error, pure tones G1–C8" d={`${sweep("sine-piano").mpm.n + sweep("sine-violin").mpm.n} frames at 44.1 and 48 kHz`} />
        <Num v={`${metrics.pipeline.median}¢`} k="median error, end to end" d={`${metrics.pipeline.segments}/${metrics.pipeline.expected} notes of a synthesized drill recovered; max ${metrics.pipeline.max}¢`} />
        <Num v={`${t[0].mpmUs} µs`} k={`per frame (violin, ${t[0].window} samples)`} d={`Median of 21 batches (fastest ${t[0].mpmBestUs} µs). ${t[1].mpmUs} µs for the piano's ${t[1].window}-sample window.`} />
        <Num v={`${metrics.vibrato.p95}¢`} k="p95 error under vibrato" d="±20¢ at 5.5 Hz, against the true pitch at each frame's centre" />
        <Num
          v={build?.entry ? kb(build.entry.gzip) : "…"}
          k="JavaScript to first paint, gzipped"
          d={build ? `The three.js stage is a separate chunk loaded after it; ${kb(build.js.gzip)} in all, worklets ${kb(build.worklets.gzip)}.` : "read from build-info.json"}
        />
      </div>
      <details className="table-details">
        <summary>Detector accuracy table: MPM (used) vs YIN, same frames</summary>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Frames</th>
                <th>MPM median / p95 / max</th>
                <th>MPM octave errors</th>
                <th>YIN median / p95 / max</th>
                <th>YIN octave errors</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td className="mono">{s.mpm.n}</td>
                  <td className="mono">
                    {s.mpm.median} / {s.mpm.p95} / {s.mpm.max}¢
                  </td>
                  <td className="mono">{s.mpm.gross + s.mpm.missed}</td>
                  <td className="mono">
                    {s.yin.median ?? "–"} / {s.yin.p95 ?? "–"} / {s.yin.max ?? "–"}¢
                  </td>
                  <td className="mono">{s.yin.gross + s.yin.missed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small-print">
          {metrics.environment}. Generated {metrics.generatedAt.slice(0, 10)} by <span className="mono">npm run metrics</span>. "Octave errors" counts
          frames more than half an octave off, plus frames with no pitch.
        </p>
      </details>
    </section>
  );
}

function Num({ v, k, d }: { v: string; k: string; d: string }) {
  return (
    <div className="num glass">
      <span className="num-v mono">{v}</span>
      <span className="num-k">{k}</span>
      <span className="num-d">{d}</span>
    </div>
  );
}

export function Pipeline() {
  const steps = [
    { t: "Input", d: "Microphone (echo cancellation, noise suppression and AGC off), or the synthesized violin running in its own AudioWorklet." },
    { t: "AudioWorklet", d: "Ring buffer → McLeod pitch method every 512 samples → { time, Hz, clarity, RMS } posted to the main thread." },
    { t: "Live bus", d: "Maps Hz to notes against the chosen A4, smooths the display with a One Euro filter, keeps the trace for the ribbon." },
    { t: "Segment & score", d: "Frames become notes; each note gets its median cents, drift after removing vibrato, and vibrato rate/depth." },
    { t: "Drill + history", d: "A pure reducer decides what each note means; sessions, streak and per-note averages are kept in localStorage." },
    { t: "Render", d: "SVG gauge, strobe and fingerboard on requestAnimationFrame; the ribbon in React Three Fiber with custom GLSL." },
  ];
  return (
    <ol className="pipeline">
      {steps.map((s, i) => (
        <li key={s.t} className="glass">
          <span className="step-n mono">{String(i + 1).padStart(2, "0")}</span>
          <b>{s.t}</b>
          <span>{s.d}</span>
        </li>
      ))}
    </ol>
  );
}

const STACK = ["TypeScript (strict)", "React 19", "Three.js · React Three Fiber", "GLSL", "Web Audio · AudioWorklet", "Vite", "node:test + tsx", "Playwright (headless checks)"];

export default function Landing() {
  const error = useStore(app, (s) => s.error);
  const persistent = useStore(app, (s) => s.persistent);
  const stack = useMemo(() => STACK, []);
  return (
    <main className="landing" id="main">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Real-time pitch analysis · Web Audio · TypeScript</p>
          <h1>
            Intonation <span className="grad">Studio</span>
          </h1>
          <p className="pitch">A practice room that listens. Play a scale and it tells you, note by note and to the cent, how in tune you were.</p>
          <StartButtons />
          <p className="fine">
            The demo needs no microphone or instrument: a synthesized violinist plays a drill into the same detector. Use headphones with the microphone so
            the guide tones stay out of it. Audio never leaves your device.
          </p>
          {error && (
            <div className="alert" role="alert">
              <span>{error}</span>
              <button className="ghost small" onClick={dismissError}>
                Dismiss
              </button>
            </div>
          )}
          {!persistent && <p className="fine warn">This browser is blocking storage, so practice history will only last for this visit.</p>}
        </div>
        <HeroTrace />
      </section>

      <Demonstrates />
      <Measured />

      <section className="section" aria-labelledby="architecture">
        <h2 id="architecture" className="section-label">
          Architecture
        </h2>
        <Pipeline />
        <div className="stack">
          {stack.map((s) => (
            <span key={s} className="chip">
              {s}
            </span>
          ))}
        </div>
      </section>

      <footer className="landing-foot">
        <a className="btn ghost" href={SOURCE_URL} target="_blank" rel="noopener">
          Source on GitHub ↗
        </a>
        <span className="muted">
          Built by <a href="/">Afung</a>. No libraries for the signal processing: the FFT, detector, segmenter and synthesizer are all in{" "}
          <span className="mono">studio-src/src/dsp</span>.
        </span>
      </footer>
    </main>
  );
}
