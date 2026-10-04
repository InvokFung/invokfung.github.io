import { rms } from "./level";
import type { PitchDetector } from "./pitch";

export interface RawFrame {
  /** Audio-clock time of the analysis window's centre, in seconds. */
  t: number;
  freq: number;
  clarity: number;
  rms: number;
}

/**
 * Feeds an arbitrary stream of sample blocks (128 at a time inside an
 * AudioWorklet) into a detector with a fixed hop. Keeps the last W samples in a
 * ring buffer and copies them out in order every `hop` samples. Allocates
 * nothing after construction.
 */
export class StreamAnalyser {
  readonly detector: PitchDetector;
  readonly hop: number;
  private readonly ring: Float32Array;
  private readonly frame: Float32Array;
  private write = 0;
  private filled = 0;
  private sinceHop = 0;

  constructor(detector: PitchDetector, hop: number) {
    this.detector = detector;
    this.hop = hop;
    this.ring = new Float32Array(detector.config.size);
    this.frame = new Float32Array(detector.config.size);
  }

  /**
   * @param samples the new block
   * @param endTime audio time just after the block's last sample
   */
  push(samples: ArrayLike<number>, endTime: number, onFrame: (f: RawFrame) => void): void {
    const W = this.ring.length;
    const sr = this.detector.config.sampleRate;
    for (let i = 0; i < samples.length; i++) {
      this.ring[this.write] = samples[i];
      this.write = (this.write + 1) % W;
      if (this.filled < W) this.filled++;
      if (++this.sinceHop >= this.hop && this.filled === W) {
        this.sinceHop = 0;
        // Oldest sample first.
        const tail = W - this.write;
        this.frame.set(this.ring.subarray(this.write), 0);
        this.frame.set(this.ring.subarray(0, this.write), tail);
        const est = this.detector.detect(this.frame);
        const t = endTime - (samples.length - 1 - i) / sr - W / 2 / sr;
        onFrame({ t, freq: est.freq, clarity: est.clarity, rms: rms(this.frame) });
      }
    }
  }

  reset() {
    this.ring.fill(0);
    this.write = this.filled = this.sinceHop = 0;
  }
}

/** Runs a whole buffer through the analyser: the offline path used by the tests and the landing illustration. */
export function analyseSignal(signal: Float32Array, detector: PitchDetector, hop: number): RawFrame[] {
  const out: RawFrame[] = [];
  const an = new StreamAnalyser(detector, hop);
  const sr = detector.config.sampleRate;
  const block = 128;
  for (let i = 0; i < signal.length; i += block) {
    const chunk = signal.subarray(i, Math.min(signal.length, i + block));
    an.push(chunk, (i + chunk.length) / sr, (f) => out.push(f));
  }
  return out;
}
