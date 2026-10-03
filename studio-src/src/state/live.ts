import { freqToMidi } from "../dsp/notes";
import { dbToUnit, toDb } from "../dsp/level";
import { PitchSmoother } from "../dsp/smoothing";
import type { PitchFrame } from "../dsp/segmenter";
import type { RawFrame } from "../dsp/stream";

/** What the gauge, readouts and visuals show. Read every animation frame; never put in React state. */
export interface LiveState {
  t: number;
  freq: number;
  /** Raw fractional MIDI note, NaN when unpitched. */
  midi: number;
  clarity: number;
  db: number;
  /** 0..1 loudness for meters and visuals. */
  level: number;
  pitched: boolean;
  /** Smoothed fractional MIDI note for display; NaN after a short silence. */
  display: number;
  /** Frames received so far (for the frame-rate readout). */
  count: number;
}

/** Ring buffer of recent frames: the history the pitch ribbon draws. */
export class Trace {
  readonly capacity: number;
  readonly t: Float64Array;
  readonly midi: Float32Array;
  readonly level: Float32Array;
  head = 0;
  size = 0;

  constructor(capacity = 1024) {
    this.capacity = capacity;
    this.t = new Float64Array(capacity);
    this.midi = new Float32Array(capacity);
    this.level = new Float32Array(capacity);
  }

  push(t: number, midi: number, level: number) {
    this.t[this.head] = t;
    this.midi[this.head] = midi;
    this.level[this.head] = level;
    this.head = (this.head + 1) % this.capacity;
    this.size = Math.min(this.capacity, this.size + 1);
  }

  /** Index of the i-th oldest entry. */
  at(i: number) {
    return (this.head - this.size + i + this.capacity) % this.capacity;
  }

  clear() {
    this.head = this.size = 0;
  }
}

const PITCHED_CLARITY = 0.82;
const PITCHED_DB = -54;
const HOLD_SECONDS = 0.25;

export class LiveBus {
  a4 = 440;
  readonly trace = new Trace(1024);
  readonly state: LiveState = { t: 0, freq: 0, midi: NaN, clarity: 0, db: -120, level: 0, pitched: false, display: NaN, count: 0 };
  private readonly smoother = new PitchSmoother();
  private lastPitched = -Infinity;
  private readonly listeners = new Set<(f: PitchFrame) => void>();

  push(raw: RawFrame) {
    const db = toDb(raw.rms);
    const midi = raw.freq > 0 ? freqToMidi(raw.freq, this.a4) : NaN;
    const pitched = Number.isFinite(midi) && raw.clarity >= PITCHED_CLARITY && db >= PITCHED_DB;
    const s = this.state;
    s.t = raw.t;
    s.freq = raw.freq;
    s.midi = midi;
    s.clarity = raw.clarity;
    s.db = db;
    s.level = dbToUnit(db);
    s.pitched = pitched;
    s.count++;
    if (pitched) {
      this.lastPitched = raw.t;
      s.display = this.smoother.push(midi, raw.t);
    } else if (raw.t - this.lastPitched > HOLD_SECONDS) {
      this.smoother.reset();
      s.display = NaN;
    }
    this.trace.push(raw.t, pitched ? midi : NaN, s.level);
    const frame: PitchFrame = { t: raw.t, midi, clarity: raw.clarity, db };
    this.listeners.forEach((l) => l(frame));
  }

  subscribe(fn: (f: PitchFrame) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  reset() {
    this.trace.clear();
    this.smoother.reset();
    Object.assign(this.state, { freq: 0, midi: NaN, clarity: 0, db: -120, level: 0, pitched: false, display: NaN });
  }
}
