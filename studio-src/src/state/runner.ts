import { NoteSegmenter, type PitchFrame } from "../dsp/segmenter";
import type { AudioEngine } from "../audio/engine";
import { DemoPerformer } from "../audio/performer";
import { drillReducer, startDrill, type DrillEvent, type DrillState } from "./drill";
import type { DrillSpec } from "../dsp/theory";
import type { LiveBus } from "./live";

export interface RunnerDeps {
  engine: AudioEngine;
  live: LiveBus;
  get: () => DrillState | null;
  set: (s: DrillState | null) => void;
  guide: () => boolean;
  a4: () => number;
  onFinish: (s: DrillState) => void;
}

const GUIDE_SECONDS = 0.5;
const LEAD_IN = 0.6;
/** After a guide tone, ignore the input this long: room echo of the tone must not count as the player. */
const MIC_BLEED = 0.18;
const DEMO_GAP = 0.14;
const NEXT_CUE = 0.28;

/**
 * Runs a drill in real time: guide tone → listen → score → next. Pitch frames
 * go through a NoteSegmenter; each finished note is handed to the pure
 * drillReducer. In demo mode a DemoPerformer answers each cue on the
 * synthesized violin, and its sound reaches the detector like a microphone would.
 */
export class DrillRunner {
  private segmenter = new NoteSegmenter();
  private muteUntil = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private unsubscribe: (() => void) | null = null;
  private performer: DemoPerformer | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;

  constructor(private deps: RunnerDeps) {}

  start(spec: DrillSpec, source: "mic" | "demo") {
    this.stop();
    const { engine, live } = this.deps;
    this.performer = source === "demo" ? new DemoPerformer() : null;
    this.segmenter.reset();
    this.deps.set(startDrill(spec, source, engine.now));
    this.unsubscribe = live.subscribe(this.onFrame);
    this.after(LEAD_IN, () => this.cue());
  }

  stop() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.deps.engine.violinStop();
  }

  /** Skips the current note (counts as not played). */
  skip() {
    const s = this.deps.get();
    if (!s || s.phase === "done") return;
    this.apply({ type: "skip", at: this.deps.engine.now });
    this.segmenter.reset();
    if (this.deps.get()?.phase === "done") this.finish();
    else this.cue();
  }

  /** Replays the guide tone for the current note. */
  replayGuide() {
    const s = this.deps.get();
    if (!s || s.phase === "done") return;
    const end = this.deps.engine.playGuide(s.notes[s.index].midi, this.deps.a4(), undefined, GUIDE_SECONDS);
    this.muteUntil = Math.max(this.muteUntil, end + (s.source === "mic" ? MIC_BLEED : 0.02));
  }

  private after(seconds: number, fn: () => void) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, seconds * 1000);
    this.timers.add(id);
  }

  private apply(ev: DrillEvent) {
    const s = this.deps.get();
    if (s) this.deps.set(drillReducer(s, ev));
  }

  private cue() {
    const s = this.deps.get();
    if (!s || s.phase === "done") return;
    const { engine } = this.deps;
    const target = s.notes[s.index];
    const index = s.index;
    if (this.deps.guide() || this.performer) {
      this.apply({ type: "phase", phase: "cue" });
      const end = engine.playGuide(target.midi, this.deps.a4(), engine.now + 0.04, GUIDE_SECONDS);
      this.muteUntil = end + (s.source === "mic" ? MIC_BLEED : 0.02);
      this.segmenter.reset();
      this.after(end - engine.now, () => {
        if (this.deps.get()?.index === index) this.apply({ type: "phase", phase: "listen" });
      });
      if (this.performer) this.perform(index, end + DEMO_GAP);
    } else {
      this.apply({ type: "phase", phase: "listen" });
    }
  }

  private perform(index: number, at: number) {
    const s = this.deps.get();
    if (!s || !this.performer) return;
    const { stroke } = this.performer.stroke(s.notes[index].midi, this.deps.a4(), 0.78);
    this.deps.engine.violinPlay(stroke, at);
    // If the note is somehow not recognised, ask again rather than stall the demo.
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      if (this.deps.get()?.index === index && this.deps.get()?.phase !== "done") this.cue();
    }, (at - this.deps.engine.now + 2.6) * 1000);
  }

  private onFrame = (f: PitchFrame) => {
    const s = this.deps.get();
    if (!s || s.phase === "done" || s.phase === "lead-in") return;
    if (f.t < this.muteUntil) {
      this.segmenter.reset();
      return;
    }
    for (const ev of this.segmenter.push(f)) {
      if (ev.type !== "end") continue;
      const before = this.deps.get()!;
      this.apply({ type: "segment", segment: ev.segment, at: this.deps.engine.now });
      const after = this.deps.get()!;
      if (after.results.length > before.results.length) {
        if (this.watchdog) clearTimeout(this.watchdog);
        if (after.phase === "done") this.finish();
        else if (this.deps.guide() || this.performer) this.after(NEXT_CUE, () => this.cue());
      }
    }
  };

  private finish() {
    const s = this.deps.get();
    this.stop();
    if (s) this.deps.onFinish(s);
  }
}
