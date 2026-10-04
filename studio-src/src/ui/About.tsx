import { useEffect, useRef, useState } from "react";
import metrics from "../generated/metrics.json";
import { McLeodDetector, PROFILES, detectorConfig } from "../dsp/pitch";
import { app, setAbout } from "../state/app";
import { useStore } from "../state/store";
import { SOURCE_URL } from "./Header";
import { Pipeline } from "./Landing";
import { EngineFacts } from "./practice";

/** Times the detector on this device, on the main thread, with a synthetic harmonic frame. */
function benchmark(): { violin: number; piano: number } {
  const time = (profile: typeof PROFILES.violin) => {
    const det = new McLeodDetector(detectorConfig(profile, 48000));
    const x = new Float32Array(det.config.size);
    for (let i = 0; i < x.length; i++) for (let h = 1; h <= 12; h++) x[i] += Math.sin((2 * Math.PI * 330 * h * i) / 48000) / h;
    for (let i = 0; i < 50; i++) det.detect(x);
    const n = 400;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) det.detect(x);
    return ((performance.now() - t0) / n) * 1000;
  };
  return { violin: time(PROFILES.violin), piano: time(PROFILES.piano) };
}

export default function About() {
  const open = useStore(app, (s) => s.aboutOpen);
  const [bench, setBench] = useState<{ violin: number; piano: number } | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAbout(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-bg" onClick={() => setAbout(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="about-title" tabIndex={-1} ref={dialog} onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2 id="about-title">How Intonation Studio works</h2>
          <button className="ghost small" onClick={() => setAbout(false)}>
            Close
          </button>
        </div>
        <p>
          Everything runs in the browser. Audio is analysed on the audio thread, in an AudioWorklet, and only small pitch messages (time, frequency, clarity,
          level) reach the page about {Math.round(1000 / metrics.hopMs)} times a second.
        </p>
        <Pipeline />
        <h3 className="section-label">The detector</h3>
        <p>
          The McLeod Pitch Method looks for the lag τ at which the signal best repeats itself, using the normalised square difference function
        </p>
        <p className="math mono">
          n′(τ) = 2·Σ x<sub>j</sub>x<sub>j+τ</sub> ⁄ Σ (x<sub>j</sub>² + x<sub>j+τ</sub>²)
        </p>
        <p>
          over the part of the window that overlaps itself. n′ is 1 for a perfect repeat, whatever the loudness. The numerator is an autocorrelation, computed
          for every lag at once with two half-size FFTs (Wiener–Khinchin); the denominator is a running sum. Of the peaks of n′, the first one within 93% of
          the highest is taken: picking the first strong peak, not the tallest, is what avoids octave errors. Its position is interpolated by fitting a cosine
          through three points (exact for a sinusoid), and short periods are re-measured over k cycles at the peak near k·τ, which divides the interpolation
          error by k.
        </p>
        <h3 className="section-label">Scoring a note</h3>
        <p>
          A note's intonation is the median of its frames' deviation from the target, after trimming the attack. Vibrato is intended, so before measuring
          steadiness the contour is smoothed with a moving average exactly one vibrato cycle long (its rate comes from the contour's autocorrelation), which
          cancels the oscillation; drift is the robust spread (1.4826 × MAD) of what is left.
        </p>
        <h3 className="section-label">This session</h3>
        <EngineFacts />
        <div className="bench-row">
          <button className="btn ghost" onClick={() => setBench(benchmark())}>
            Time the detector on this device
          </button>
          {bench && (
            <span className="mono">
              violin window {bench.violin.toFixed(0)} µs · piano window {bench.piano.toFixed(0)} µs per frame (budget {(metrics.hopMs * 1000).toFixed(0)} µs)
            </span>
          )}
        </div>
        <h3 className="section-label">Limits</h3>
        <ul className="limits">
          <li>One note at a time: double stops and chords are not analysed.</li>
          <li>On a piano the tuning is fixed, so cents describe the instrument; drills there mainly check the right notes.</li>
          <li>Below G1 (49 Hz) is out of range, and laptop microphones are weak in the bass.</li>
          <li>With speakers instead of headphones the guide tone can leak into the microphone; input is muted briefly after each tone to compensate.</li>
        </ul>
        <p className="muted small-print">
          Source and README with the measurements:{" "}
          <a href={SOURCE_URL} target="_blank" rel="noopener">
            studio-src on GitHub
          </a>
          .
        </p>
      </div>
    </div>
  );
}
