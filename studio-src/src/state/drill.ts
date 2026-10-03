import { analyseNote, noteScore, rate, type Rating } from "../dsp/scoring";
import type { NoteSegment } from "../dsp/segmenter";
import { buildDrill, drillId, drillTitle, type DrillNote, type DrillSpec } from "../dsp/theory";
import { noteLabel } from "../dsp/notes";

/**
 * The drill as a pure state machine. Timing (guide tones, the demo player,
 * timers) lives in the runner; this file only decides what a heard note means.
 */
export interface NoteResult {
  index: number;
  midi: number;
  label: string;
  cents: number;
  drift: number;
  vibrato: { rate: number; depth: number } | null;
  score: number;
  rating: Rating;
  duration: number;
}

export type DrillPhase = "lead-in" | "cue" | "listen" | "done";

export interface DrillState {
  id: string;
  spec: DrillSpec;
  title: string;
  notes: DrillNote[];
  /** Index of the note being asked for. */
  index: number;
  phase: DrillPhase;
  results: NoteResult[];
  /** Notes heard that were not the target (more than a quarter-tone away). */
  wrong: number;
  lastWrong: { heard: string; expected: string; at: number } | null;
  source: "mic" | "demo";
  startedAt: number;
  endedAt: number | null;
}

export type DrillEvent =
  | { type: "phase"; phase: "cue" | "listen" }
  | { type: "segment"; segment: NoteSegment; at: number }
  | { type: "skip"; at: number }
  | { type: "finish"; at: number };

/** Shorter sounds are ignored: bow noise, a brushed string, a mis-tracked frame or two. */
export const MIN_NOTE_SECONDS = 0.12;

export function startDrill(spec: DrillSpec, source: "mic" | "demo", now: number): DrillState {
  return {
    id: drillId(spec),
    spec,
    title: drillTitle(spec),
    notes: buildDrill(spec),
    index: 0,
    phase: "lead-in",
    results: [],
    wrong: 0,
    lastWrong: null,
    source,
    startedAt: now,
    endedAt: null,
  };
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) >> 1] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
}

export function drillReducer(state: DrillState, ev: DrillEvent): DrillState {
  if (state.phase === "done") return state;
  switch (ev.type) {
    case "phase":
      return { ...state, phase: ev.phase };
    case "finish":
      return { ...state, phase: "done", endedAt: ev.at };
    case "skip": {
      const index = state.index + 1;
      return index >= state.notes.length ? { ...state, index, phase: "done", endedAt: ev.at } : { ...state, index };
    }
    case "segment": {
      const { segment } = ev;
      const duration = segment.end - segment.start;
      if (duration < MIN_NOTE_SECONDS) return state;
      const target = state.notes[state.index];
      const centre = median(segment.frames.map((f) => f.midi));
      if (Math.abs(centre - target.midi) > 0.5) {
        return { ...state, wrong: state.wrong + 1, lastWrong: { heard: noteLabel(Math.round(centre)), expected: target.label, at: ev.at } };
      }
      const a = analyseNote(segment.frames, target.midi);
      const result: NoteResult = {
        index: state.index,
        midi: target.midi,
        label: target.label,
        cents: a.cents,
        drift: a.drift,
        vibrato: a.vibrato,
        score: noteScore(a),
        rating: rate(a.cents),
        duration,
      };
      const index = state.index + 1;
      const done = index >= state.notes.length;
      return {
        ...state,
        index,
        results: [...state.results, result],
        lastWrong: null,
        phase: done ? "done" : state.phase,
        endedAt: done ? ev.at : null,
      };
    }
  }
}

export interface DrillSummary {
  score: number;
  played: number;
  inTune: number;
  meanAbs: number;
  meanSigned: number;
  drift: number;
  vibrato: { rate: number; depth: number } | null;
  best: NoteResult | null;
  worst: NoteResult | null;
}

export function summariseDrill(s: DrillState): DrillSummary {
  const r = s.results;
  if (!r.length) return { score: 0, played: 0, inTune: 0, meanAbs: 0, meanSigned: 0, drift: 0, vibrato: null, best: null, worst: null };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const vib = r.filter((x) => x.vibrato).map((x) => x.vibrato!);
  const byAbs = [...r].sort((a, b) => Math.abs(a.cents) - Math.abs(b.cents));
  return {
    score: Math.round(mean(r.map((x) => x.score))),
    played: r.length,
    inTune: r.filter((x) => Math.abs(x.cents) <= 10).length,
    meanAbs: mean(r.map((x) => Math.abs(x.cents))),
    meanSigned: mean(r.map((x) => x.cents)),
    drift: mean(r.map((x) => x.drift)),
    vibrato: vib.length ? { rate: mean(vib.map((v) => v.rate)), depth: mean(vib.map((v) => v.depth)) } : null,
    best: byAbs[0],
    worst: byAbs[byAbs.length - 1],
  };
}
