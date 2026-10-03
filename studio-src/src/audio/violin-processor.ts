/// AudioWorklet: the demo's synthesized violinist. Plays scheduled bow strokes sample-accurately.
import { ViolinVoice, type BowStroke } from "../dsp/violin";
import type { ViolinCommand } from "./messages";
import { scope, type ProcessorBase } from "./worklet-env";

class ViolinProcessor extends scope.AudioWorkletProcessor implements ProcessorBase {
  private readonly voice = new ViolinVoice(scope.sampleRate, 19);
  private queue: { at: number; stroke: BowStroke }[] = [];

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<ViolinCommand>) => {
      if (e.data.type === "play") {
        this.queue.push({ at: e.data.at, stroke: e.data.stroke });
        this.queue.sort((a, b) => a.at - b.at);
      } else {
        this.queue = [];
        this.voice.release();
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0][0];
    const n = out.length;
    const sr = scope.sampleRate;
    const start = scope.currentTime;
    let cursor = 0;
    while (this.queue.length && this.queue[0].at < start + n / sr) {
      const { at, stroke } = this.queue.shift()!;
      const idx = Math.max(cursor, Math.min(n, Math.round((at - start) * sr)));
      this.voice.render(out, cursor, idx);
      this.voice.play(stroke);
      cursor = idx;
    }
    this.voice.render(out, cursor, n);
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}

scope.registerProcessor("demo-violin", ViolinProcessor);
