/**
 * Accuracy and speed measurements shared by the unit tests (which assert
 * bounds) and scripts/bench.ts (which publishes the numbers).
 */
import { McLeodDetector, YinDetector, PROFILES, detectorConfig, type DetectorProfile, type PitchDetector } from "../src/dsp/pitch";
import { cents, freqToMidi, midiToFreq } from "../src/dsp/notes";
import { analyseSignal } from "../src/dsp/stream";
import { NoteSegmenter, type PitchFrame } from "../src/dsp/segmenter";
import { analyseNote } from "../src/dsp/scoring";
import { buildDrill } from "../src/dsp/theory";
import { renderPhrase, type PhraseNote } from "../src/dsp/violin";
import { toDb } from "../src/dsp/level";
import { mulberry32 } from "../src/dsp/rng";
import { harmonics, sawAmps, sine, vibratoTone, whiteNoise, withNoise } from "./signals";

export type DetectorKind = "mpm" | "yin";
export const makeDetector = (kind: DetectorKind, profile: DetectorProfile, sr: number): PitchDetector =>
  kind === "mpm" ? new McLeodDetector(detectorConfig(profile, sr)) : new YinDetector(detectorConfig(profile, sr));

export interface SweepResult {
  id: string;
  label: string;
  detector: DetectorKind;
  /** Frames tested. */
  n: number;
  /** Frames with no pitch reported. */
  missed: number;
  /** Frames reported more than half an octave away (octave or fifth errors). */
  gross: number;
  /** Absolute error in cents over the frames that were neither missed nor gross. */
  median: number;
  p95: number;
  max: number;
}

type Gen = (freq: number, n: number, sr: number, seed: number) => Float32Array;

export interface SweepCase {
  id: string;
  label: string;
  profile: keyof typeof PROFILES;
  /** MIDI range and step (semitones). */
  lo: number;
  hi: number;
  step: number;
  gen: Gen;
}

const PHASES = [0, 1.3, 2.9];

export const CASES: SweepCase[] = [
  { id: "sine-violin", label: "Pure sine, G3–E7 (violin window)", profile: "violin", lo: 55, hi: 100, step: 0.25, gen: (f, n, sr, s) => sine(f, sr, n, PHASES[s % 3]) },
  { id: "sine-piano", label: "Pure sine, G1–C8 (piano window)", profile: "piano", lo: 31, hi: 108, step: 0.25, gen: (f, n, sr, s) => sine(f, sr, n, PHASES[s % 3]) },
  { id: "saw-violin", label: "Sawtooth spectrum (24 harmonics), violin range", profile: "violin", lo: 55, hi: 100, step: 0.5, gen: (f, n, sr, s) => harmonics(f, sawAmps(24), sr, n, s) },
  { id: "saw-piano", label: "Sawtooth spectrum (24 harmonics), piano range", profile: "piano", lo: 31, hi: 108, step: 0.5, gen: (f, n, sr, s) => harmonics(f, sawAmps(24), sr, n, s) },
  { id: "weak-fundamental", label: "Fundamental 20 dB below the 2nd harmonic", profile: "violin", lo: 55, hi: 100, step: 0.5, gen: (f, n, sr, s) => harmonics(f, [0.1, 1, 0.5, 0.3, 0.2, 0.1], sr, n, s) },
  { id: "missing-fundamental", label: "Missing fundamental (harmonics 2–8 only)", profile: "violin", lo: 55, hi: 90, step: 0.5, gen: (f, n, sr, s) => harmonics(f, [0, 1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2], sr, n, s) },
  { id: "odd-harmonics", label: "Odd harmonics only (clarinet-like)", profile: "violin", lo: 55, hi: 95, step: 0.5, gen: (f, n, sr, s) => harmonics(f, [1, 0, 0.6, 0, 0.4, 0, 0.3, 0, 0.2], sr, n, s) },
  { id: "piano-bass", label: "Piano bass, weak fundamental, G1–G3", profile: "piano", lo: 31, hi: 55, step: 0.5, gen: (f, n, sr, s) => harmonics(f, [0.3, 1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2], sr, n, s) },
  { id: "snr20", label: "Sawtooth + white noise, SNR 20 dB", profile: "violin", lo: 55, hi: 100, step: 0.5, gen: (f, n, sr, s) => withNoise(harmonics(f, sawAmps(16), sr, n, s), 20, s) },
  { id: "snr10", label: "Sawtooth + white noise, SNR 10 dB", profile: "violin", lo: 55, hi: 100, step: 0.5, gen: (f, n, sr, s) => withNoise(harmonics(f, sawAmps(16), sr, n, s), 10, s) },
  { id: "snr5", label: "Sawtooth + white noise, SNR 5 dB", profile: "violin", lo: 55, hi: 100, step: 0.5, gen: (f, n, sr, s) => withNoise(harmonics(f, sawAmps(16), sr, n, s), 5, s) },
  { id: "snr0", label: "Sawtooth + white noise, SNR 0 dB", profile: "violin", lo: 55, hi: 100, step: 0.5, gen: (f, n, sr, s) => withNoise(harmonics(f, sawAmps(16), sr, n, s), 0, s) },
];

const quantile = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : NaN);

export function runSweep(c: SweepCase, kind: DetectorKind, sampleRates = [44100, 48000]): SweepResult {
  const errs: number[] = [];
  let n = 0;
  let missed = 0;
  let gross = 0;
  let seed = 1;
  for (const sr of sampleRates) {
    const det = makeDetector(kind, PROFILES[c.profile], sr);
    for (let m = c.lo; m <= c.hi + 1e-9; m += c.step) {
      const f = midiToFreq(m);
      const x = c.gen(f, det.config.size, sr, seed++);
      const r = det.detect(x);
      n++;
      if (!r.freq) {
        missed++;
        continue;
      }
      const e = Math.abs(cents(r.freq, f));
      if (e > 600) gross++;
      else errs.push(e);
    }
  }
  errs.sort((a, b) => a - b);
  return { id: c.id, label: c.label, detector: kind, n, missed, gross, median: quantile(errs, 0.5), p95: quantile(errs, 0.95), max: errs[errs.length - 1] ?? NaN };
}

/** Frame-by-frame error against the instantaneous pitch at each window's centre. */
export function vibratoAccuracy(kind: DetectorKind = "mpm", sr = 48000) {
  const det = makeDetector(kind, PROFILES.violin, sr);
  const W = det.config.size;
  const { x, f0 } = vibratoTone(440, sr, sr * 2, 5.5, 20);
  const errs: number[] = [];
  for (let s = 0; s + W <= x.length; s += 512) {
    const r = det.detect(x.subarray(s, s + W));
    errs.push(r.freq ? Math.abs(cents(r.freq, f0[s + W / 2])) : Infinity);
  }
  errs.sort((a, b) => a - b);
  return { n: errs.length, median: quantile(errs, 0.5), p95: quantile(errs, 0.95), max: errs[errs.length - 1] };
}

/** Fraction of white-noise frames the detector calls pitched (it should not). */
export function noiseFalsePositives(kind: DetectorKind = "mpm", sr = 48000, frames = 200) {
  let pitched = 0;
  for (const p of ["violin", "piano"] as const) {
    const det = makeDetector(kind, PROFILES[p], sr);
    for (let s = 0; s < frames; s++) {
      const r = det.detect(whiteNoise(det.config.size, 0.3, s + 1));
      if (r.freq && r.clarity >= 0.8) pitched++;
    }
  }
  return { frames: frames * 2, pitched };
}

/** Mean microseconds per detect() call on a harmonic-rich frame. */
/**
 * Microseconds per detect() call: 21 batches of 200 calls, reporting the median
 * batch (robust to a busy machine) and the fastest (closest to the true cost).
 */
export function timePerFrame(kind: DetectorKind, profile: keyof typeof PROFILES, sr = 48000, batches = 21, perBatch = 200) {
  const det = makeDetector(kind, PROFILES[profile], sr);
  const x = harmonics(330, sawAmps(16), sr, det.config.size, 9);
  for (let i = 0; i < 400; i++) det.detect(x);
  const times: number[] = [];
  for (let b = 0; b < batches; b++) {
    const t0 = performance.now();
    for (let i = 0; i < perBatch; i++) det.detect(x);
    times.push(((performance.now() - t0) / perBatch) * 1000);
  }
  times.sort((a, b) => a - b);
  return { window: det.config.size, us: times[batches >> 1], best: times[0] };
}

export interface PipelineNote {
  target: string;
  programmed: number;
  measured: number;
  detectedMidi: number;
  vibrato: { rate: number; depth: number } | null;
}

/**
 * End to end, offline: the synthesized violin plays a drill with known
 * intonation errors; the stream analyser, segmenter and scorer must recover
 * every note and its error.
 */
export function pipelineAccuracy(sr = 48000, hop = 512) {
  const drill = buildDrill({ instrument: "violin", tonic: "D", mode: "major", form: "scale", octaves: 2 });
  const rand = mulberry32(42);
  const offsets = drill.map(() => Math.round((rand() * 2 - 1) * 25)); // −25..+25 cents
  const notes: PhraseNote[] = drill.map((d, i) => ({ freq: midiToFreq(d.midi + offsets[i] / 100), start: i * 0.72, duration: 0.6, vibratoDepth: 16 }));
  const audio = renderPhrase(notes, sr, 11);
  const det = new McLeodDetector(detectorConfig(PROFILES.violin, sr));
  const frames = analyseSignal(audio, det, hop);
  const seg = new NoteSegmenter();
  const segments = [];
  for (const f of frames) {
    const pf: PitchFrame = { t: f.t, midi: f.freq ? freqToMidi(f.freq) : NaN, clarity: f.clarity, db: toDb(f.rms) };
    for (const ev of seg.push(pf)) if (ev.type === "end") segments.push(ev.segment);
  }
  for (const ev of seg.flush()) if (ev.type === "end") segments.push(ev.segment);
  const result: PipelineNote[] = segments.map((s, i) => {
    const target = drill[Math.min(i, drill.length - 1)];
    const a = analyseNote(s.frames, target.midi);
    return { target: target.label, programmed: offsets[i], measured: a.cents, detectedMidi: s.midi, vibrato: a.vibrato };
  });
  const errors = result.map((r) => Math.abs(r.measured - r.programmed)).sort((a, b) => a - b);
  return { expected: drill.length, segments: segments.length, notes: result, median: quantile(errors, 0.5), max: errors[errors.length - 1], frames: frames.length };
}
