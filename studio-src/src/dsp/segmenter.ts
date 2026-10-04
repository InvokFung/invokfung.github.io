/**
 * Turns a stream of pitch frames into notes.
 *
 * A note starts after a few consecutive pitched frames agree with each other,
 * continues while frames stay near its running centre, and ends on silence or
 * when a different, stable pitch takes over (a legato change of note). One-off
 * glitches, such as a single octave-jumped frame or a bow-change crackle, are
 * absorbed instead of splitting the note. Voicing uses hysteresis: entering a
 * note needs a clearer, louder frame than staying in one.
 */

export interface PitchFrame {
  /** Time of the analysis window's centre, in seconds. */
  t: number;
  /** Fractional MIDI note (69 = A4 at the current reference), NaN when unpitched. */
  midi: number;
  clarity: number;
  /** Level in dBFS. */
  db: number;
}

export interface SegmentFrame {
  t: number;
  midi: number;
  db: number;
}

export interface NoteSegment {
  start: number;
  end: number;
  /** Nearest equal-tempered note to the segment's median pitch. */
  midi: number;
  frames: SegmentFrame[];
}

export type SegmentEvent = { type: "onset"; segment: NoteSegment } | { type: "end"; segment: NoteSegment };

export interface SegmenterConfig {
  /** Clarity needed to start a note, and to stay in one. */
  onClarity: number;
  holdClarity: number;
  /** Level needed to start a note, and to stay in one (dBFS). */
  onDb: number;
  holdDb: number;
  /** Consecutive agreeing frames that make an onset. */
  onsetFrames: number;
  /** Consecutive unpitched frames that end a note. */
  releaseFrames: number;
  /** Consecutive frames at a new stable pitch that end a note and start the next. */
  changeFrames: number;
  /** Max distance from the note's centre, in semitones, for a frame to belong to it. */
  tolerance: number;
}

export const DEFAULT_SEGMENTER: SegmenterConfig = {
  onClarity: 0.9,
  holdClarity: 0.8,
  onDb: -48,
  holdDb: -56,
  onsetFrames: 3,
  releaseFrames: 5,
  changeFrames: 3,
  tolerance: 0.6,
};

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) >> 1] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
}

const spread = (frames: SegmentFrame[]) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const f of frames) {
    lo = Math.min(lo, f.midi);
    hi = Math.max(hi, f.midi);
  }
  return hi - lo;
};

export class NoteSegmenter {
  readonly config: SegmenterConfig;
  private current: NoteSegment | null = null;
  private candidates: SegmentFrame[] = [];
  private deviants: SegmentFrame[] = [];
  private silent = 0;
  private silentSince = 0;

  constructor(config: Partial<SegmenterConfig> = {}) {
    this.config = { ...DEFAULT_SEGMENTER, ...config };
  }

  /** The note currently sounding, if any. */
  get active(): NoteSegment | null {
    return this.current;
  }

  reset() {
    this.current = null;
    this.candidates = [];
    this.deviants = [];
    this.silent = 0;
  }

  push(frame: PitchFrame): SegmentEvent[] {
    const c = this.config;
    const inNote = this.current !== null;
    const pitched =
      Number.isFinite(frame.midi) &&
      frame.clarity >= (inNote ? c.holdClarity : c.onClarity) &&
      frame.db >= (inNote ? c.holdDb : c.onDb);
    const f: SegmentFrame = { t: frame.t, midi: frame.midi, db: frame.db };
    return inNote ? this.continueNote(f, pitched) : this.awaitOnset(f, pitched);
  }

  /** Ends any sounding note (e.g. when the input stops). */
  flush(): SegmentEvent[] {
    const out: SegmentEvent[] = [];
    if (this.current) out.push(this.close(this.current.frames[this.current.frames.length - 1].t));
    this.reset();
    return out;
  }

  private awaitOnset(f: SegmentFrame, pitched: boolean): SegmentEvent[] {
    if (!pitched) {
      this.candidates = [];
      return [];
    }
    this.candidates.push(f);
    // Drop the oldest frames until the rest agree; a slide into the note simply delays the onset.
    while (this.candidates.length > 1 && spread(this.candidates) > this.config.tolerance) this.candidates.shift();
    if (this.candidates.length >= this.config.onsetFrames) return [this.open(this.candidates)];
    return [];
  }

  private continueNote(f: SegmentFrame, pitched: boolean): SegmentEvent[] {
    const cur = this.current!;
    const c = this.config;
    if (!pitched) {
      if (this.silent === 0) this.silentSince = f.t;
      this.silent++;
      this.deviants = [];
      if (this.silent >= c.releaseFrames) {
        const ev = this.close(this.silentSince);
        this.reset();
        return [ev];
      }
      return [];
    }
    this.silent = 0;
    const centre = median(cur.frames.slice(-15).map((x) => x.midi));
    if (Math.abs(f.midi - centre) <= c.tolerance) {
      cur.frames.push(f);
      this.deviants = [];
      return [];
    }
    // A frame away from the note: a glitch, or the start of the next note?
    this.deviants.push(f);
    while (this.deviants.length > 1 && spread(this.deviants) > c.tolerance) this.deviants.shift();
    if (this.deviants.length >= c.changeFrames) {
      const next = this.deviants;
      const ended = this.close(next[0].t);
      this.reset();
      return [ended, this.open(next)];
    }
    return [];
  }

  private open(frames: SegmentFrame[]): SegmentEvent {
    const seg: NoteSegment = { start: frames[0].t, end: frames[frames.length - 1].t, midi: Math.round(median(frames.map((x) => x.midi))), frames: [...frames] };
    this.current = seg;
    this.candidates = [];
    this.deviants = [];
    return { type: "onset", segment: seg };
  }

  private close(end: number): SegmentEvent {
    const seg = this.current!;
    seg.end = Math.max(end, seg.frames[seg.frames.length - 1].t);
    seg.midi = Math.round(median(seg.frames.map((x) => x.midi)));
    this.current = null;
    return { type: "end", segment: seg };
  }
}
