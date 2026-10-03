import { midiToFreq } from "../dsp/notes";
import { gaussian, mulberry32 } from "../dsp/rng";
import type { BowStroke } from "../dsp/violin";

/**
 * The demo's violinist. Like a real player it has consistent tendencies per
 * note (a few notes sit sharp, a few flat), a little random scatter, and the
 * occasional slip, so a few demo runs build a believable heatmap.
 */
export class DemoPerformer {
  private readonly rand: () => number;

  constructor(seed = Date.now()) {
    this.rand = mulberry32(seed);
  }

  /** The player's habitual error on this note, in cents. */
  static tendency(midi: number): number {
    return 9 * Math.sin(midi * 2.39 + 0.7) + 4 * Math.sin(midi * 0.61);
  }

  stroke(midi: number, a4: number, duration = 0.8): { stroke: BowStroke; intended: number } {
    let cents = DemoPerformer.tendency(midi) + 3 * gaussian(this.rand);
    if (this.rand() < 0.07) cents += (this.rand() < 0.5 ? -1 : 1) * (16 + 10 * this.rand());
    return {
      intended: cents,
      stroke: {
        freq: midiToFreq(midi + cents / 100, a4),
        duration,
        velocity: 0.7 + 0.2 * this.rand(),
        vibratoDepth: 12 + 8 * this.rand(),
        vibratoDelay: 0.14 + 0.08 * this.rand(),
      },
    };
  }
}
