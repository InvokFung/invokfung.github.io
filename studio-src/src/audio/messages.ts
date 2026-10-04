import type { DetectorProfile } from "../dsp/pitch";
import type { BowStroke } from "../dsp/violin";

/** Main thread → pitch detector worklet. */
export type DetectorCommand = { type: "profile"; profile: DetectorProfile; hop: number };

/** Pitch detector worklet → main thread. One message per analysis hop. */
export type DetectorMessage =
  | { type: "ready"; sampleRate: number; window: number; hop: number }
  | { type: "frame"; t: number; freq: number; clarity: number; rms: number };

/** Main thread → demo violin worklet. */
export type ViolinCommand = { type: "play"; at: number; stroke: BowStroke } | { type: "stop" };
