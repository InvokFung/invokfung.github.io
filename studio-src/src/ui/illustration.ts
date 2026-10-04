import { McLeodDetector, PROFILES, detectorConfig } from "../dsp/pitch";
import { dbToUnit, toDb } from "../dsp/level";
import { freqToMidi, midiToFreq } from "../dsp/notes";
import { analyseSignal } from "../dsp/stream";
import { renderPhrase, type PhraseNote } from "../dsp/violin";
import { Trace } from "../state/live";

/**
 * The landing page's picture is not drawn by hand: a short phrase is rendered
 * by the synthesized violin and run through the real detector, in the browser,
 * when the page loads. Two notes are played off on purpose so the colours show.
 */
export interface Illustration {
  trace: Trace;
  start: number;
  end: number;
  centre: number;
  /** Fractional MIDI at a time, for the ribbon's head. */
  at(t: number): { midi: number; level: number };
}

const PHRASE: [number, number, number][] = [
  // [midi, cents off, seconds]
  [74, 0, 0.34],
  [76, -3, 0.34],
  [78, 16, 0.34],
  [79, 2, 0.34],
  [81, -2, 0.62],
  [79, -1, 0.3],
  [78, 4, 0.3],
  [76, -19, 0.34],
  [74, 1, 1.1],
];

export function buildIllustration(sampleRate = 48000): Illustration {
  let t = 0.05;
  const notes: PhraseNote[] = PHRASE.map(([m, c, d], i) => {
    const n: PhraseNote = { freq: midiToFreq(m + c / 100), start: t, duration: d - 0.03, vibratoDepth: i === PHRASE.length - 1 || d > 0.5 ? 18 : 8, vibratoDelay: 0.12 };
    t += d;
    return n;
  });
  const audio = renderPhrase(notes, sampleRate, 5, 0.3);
  const det = new McLeodDetector(detectorConfig(PROFILES.violin, sampleRate));
  const frames = analyseSignal(audio, det, 512);
  const trace = new Trace(1024);
  for (const f of frames) {
    const db = toDb(f.rms);
    const pitched = f.freq > 0 && f.clarity >= 0.82 && db > -54;
    trace.push(f.t, pitched ? freqToMidi(f.freq) : NaN, dbToUnit(db));
  }
  const start = frames[0]?.t ?? 0;
  const end = frames[frames.length - 1]?.t ?? 1;
  return {
    trace,
    start,
    end,
    centre: 77.5,
    at(time: number) {
      let lo = 0;
      let hi = trace.size - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (trace.t[trace.at(mid)] <= time) lo = mid;
        else hi = mid - 1;
      }
      const k = trace.at(lo);
      return { midi: trace.midi[k], level: trace.level[k] };
    },
  };
}
