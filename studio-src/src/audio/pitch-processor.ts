/// AudioWorklet: runs the pitch detector on the audio rendering thread.
import { McLeodDetector, PROFILES, detectorConfig } from "../dsp/pitch";
import { StreamAnalyser } from "../dsp/stream";
import type { DetectorCommand, DetectorMessage } from "./messages";
import { scope, type ProcessorBase } from "./worklet-env";

const BLOCK = 128;

class PitchProcessor extends scope.AudioWorkletProcessor implements ProcessorBase {
  private analyser = PitchProcessor.make(PROFILES.violin, 512);
  private readonly mono = new Float32Array(BLOCK);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<DetectorCommand>) => {
      if (e.data.type === "profile") {
        this.analyser = PitchProcessor.make(e.data.profile, e.data.hop);
        this.announce();
      }
    };
    this.announce();
  }

  private static make(profile: typeof PROFILES.violin, hop: number) {
    return new StreamAnalyser(new McLeodDetector(detectorConfig(profile, scope.sampleRate)), hop);
  }

  private announce() {
    const msg: DetectorMessage = { type: "ready", sampleRate: scope.sampleRate, window: this.analyser.detector.config.size, hop: this.analyser.hop };
    this.port.postMessage(msg);
  }

  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    let samples: Float32Array = channels[0];
    if (channels.length > 1) {
      // Mix down to mono.
      const n = samples.length;
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < channels.length; c++) s += channels[c][i];
        this.mono[i] = s / channels.length;
      }
      samples = this.mono.subarray(0, n);
    }
    const end = scope.currentTime + samples.length / scope.sampleRate;
    this.analyser.push(samples, end, (f) => {
      const msg: DetectorMessage = { type: "frame", t: f.t, freq: f.freq, clarity: f.clarity, rms: f.rms };
      this.port.postMessage(msg);
    });
    return true;
  }
}

scope.registerProcessor("pitch-detector", PitchProcessor);
