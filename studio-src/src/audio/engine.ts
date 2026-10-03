import pitchWorkletUrl from "./pitch-processor.ts?worker&url";
import violinWorkletUrl from "./violin-processor.ts?worker&url";
import type { DetectorProfile } from "../dsp/pitch";
import type { BowStroke } from "../dsp/violin";
import { midiToFreq } from "../dsp/notes";
import type { RawFrame } from "../dsp/stream";
import type { DetectorCommand, DetectorMessage, ViolinCommand } from "./messages";

export type SourceKind = "mic" | "demo";

export interface EngineInfo {
  sampleRate: number;
  window: number;
  hop: number;
  /** Output latency reported by the browser, in seconds (0 if unknown). */
  outputLatency: number;
}

/** Analysis hop in samples: about 10.7 ms at 48 kHz, ~94 pitch frames per second. */
export const HOP = 512;

/** Turns getUserMedia failures into something a person can act on. */
export function describeMicError(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Microphone access was blocked. Allow it from the site settings next to the address bar, or try the demo, which needs no microphone.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No microphone was found on this device. The demo works without one.";
    case "NotReadableError":
    case "TrackStartError":
      return "The microphone is in use by another app, or the system blocked it. Close other apps using it and try again.";
    case "SecurityError":
      return "The browser only allows microphone access on a secure (https) page.";
    case "InsecureContext":
      return "Microphone access needs a secure (https) page.";
    default:
      return `The microphone could not be started${err instanceof Error && err.message ? ` (${err.message})` : ""}. The demo works without one.`;
  }
}

/**
 * Owns the audio graph:
 *
 *   mic ─┐
 *        ├─▶ pitch-detector (AudioWorklet) ─▶ silent sink ─▶ destination
 *   demo violin (AudioWorklet) ─┘     └──▶ monitor ─▶ destination
 *   guide tones (oscillators) ─────────────────────▶ destination
 *
 * The detector has an output only so the graph keeps pulling it; that output is
 * muted. Pitch frames come back over the worklet's MessagePort.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private detector: AudioWorkletNode | null = null;
  private violin: AudioWorkletNode | null = null;
  private monitor: GainNode | null = null;
  private guideBus: GainNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private source: SourceKind | null = null;
  private ready: Promise<void> | null = null;
  info: EngineInfo | null = null;
  onFrame: ((f: RawFrame) => void) | null = null;
  onInfo: ((info: EngineInfo) => void) | null = null;

  get running() {
    return this.source !== null;
  }

  get kind() {
    return this.source;
  }

  /** Audio-clock time in seconds (the clock pitch frames are stamped with). */
  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) throw new Error("This browser has no Web Audio support.");
      const ctx = new Ctx({ latencyHint: "interactive" });
      if (!ctx.audioWorklet) throw new Error("This browser does not support AudioWorklet.");
      await Promise.all([ctx.audioWorklet.addModule(pitchWorkletUrl), ctx.audioWorklet.addModule(violinWorkletUrl)]);

      const detector = new AudioWorkletNode(ctx, "pitch-detector", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: "explicit" });
      const sink = new GainNode(ctx, { gain: 0 });
      detector.connect(sink).connect(ctx.destination);
      detector.port.onmessage = (e: MessageEvent<DetectorMessage>) => {
        const m = e.data;
        if (m.type === "frame") this.onFrame?.(m);
        else {
          this.info = { sampleRate: m.sampleRate, window: m.window, hop: m.hop, outputLatency: ctx.outputLatency ?? 0 };
          this.onInfo?.(this.info);
        }
      };

      const violin = new AudioWorkletNode(ctx, "demo-violin", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
      const monitor = new GainNode(ctx, { gain: 0.9 });
      monitor.connect(ctx.destination);
      const guideBus = new GainNode(ctx, { gain: 0.9 });
      guideBus.connect(ctx.destination);

      Object.assign(this, { ctx, detector, violin, monitor, guideBus });
    })();
    this.ready.catch(() => (this.ready = null));
    return this.ready;
  }

  /** Starts listening to the microphone or to the demo violin. Throws a readable message on failure. */
  async start(kind: SourceKind, profile: DetectorProfile): Promise<void> {
    // Ask for the microphone first, while the click's user activation is fresh.
    let stream: MediaStream | null = null;
    if (kind === "mic") {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(describeMicError(new DOMException("insecure", window.isSecureContext ? "NotFoundError" : "InsecureContext")));
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // Processing meant for speech would fight a sustained instrument tone.
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (err) {
        throw new Error(describeMicError(err));
      }
    }
    await this.init();
    const ctx = this.ctx!;
    this.disconnectSource();
    this.setProfile(profile);
    if (stream) {
      this.stream = stream;
      this.micSource = ctx.createMediaStreamSource(stream);
      this.micSource.connect(this.detector!);
    } else {
      this.violin!.connect(this.detector!);
      this.violin!.connect(this.monitor!);
    }
    this.source = kind;
    await ctx.resume();
  }

  setProfile(profile: DetectorProfile) {
    const cmd: DetectorCommand = { type: "profile", profile, hop: HOP };
    this.detector?.port.postMessage(cmd);
  }

  private disconnectSource() {
    this.micSource?.disconnect();
    this.micSource = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try {
      this.violin?.disconnect();
    } catch {
      // not connected
    }
    this.violinStop();
  }

  async stop() {
    this.disconnectSource();
    this.source = null;
    await this.ctx?.suspend();
  }

  /**
   * A guide tone for the target note: a soft, flute-like sine with a quiet
   * octave, deliberately unlike the violin so the two are easy to tell apart.
   * Returns the time it ends.
   */
  playGuide(midi: number, a4: number, at = this.now + 0.03, duration = 0.5, gain = 0.16): number {
    const ctx = this.ctx;
    if (!ctx || !this.guideBus) return at + duration;
    const f = midiToFreq(midi, a4);
    const env = new GainNode(ctx, { gain: 0 });
    env.connect(this.guideBus);
    const end = at + duration;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.03);
    env.gain.setValueAtTime(gain, end - 0.12);
    env.gain.exponentialRampToValueAtTime(0.0005, end);
    const partials: [number, number][] = [
      [1, 1],
      [2, 0.18],
      [3, 0.05],
    ];
    for (const [h, a] of partials) {
      const osc = new OscillatorNode(ctx, { frequency: f * h, type: "sine" });
      const g = new GainNode(ctx, { gain: a });
      osc.connect(g).connect(env);
      osc.start(at);
      osc.stop(end + 0.02);
      osc.onended = () => g.disconnect();
    }
    setTimeout(() => env.disconnect(), (end - ctx.currentTime + 0.2) * 1000);
    return end;
  }

  /** Schedules a bow stroke on the demo violin. */
  violinPlay(stroke: BowStroke, at: number) {
    const cmd: ViolinCommand = { type: "play", at, stroke };
    this.violin?.port.postMessage(cmd);
  }

  violinStop() {
    const cmd: ViolinCommand = { type: "stop" };
    this.violin?.port.postMessage(cmd);
  }
}
