import { Biquad, bandpass, highpass, lowpass, peaking } from "./biquad";
import { gaussian, mulberry32 } from "./rng";

/**
 * A synthesized bowed string, good enough to exercise the detector the way a
 * real violin does: a bright, harmonic-rich sawtooth (the Helmholtz motion of a
 * bowed string is close to one), two slightly detuned oscillators, delayed
 * vibrato, a slow random pitch drift, bow noise with a scratchy attack, and a
 * few fixed body resonances that tilt the harmonics the way a violin body does.
 *
 * It is pure TypeScript with no Web Audio dependency, so the demo (inside an
 * AudioWorklet), the unit tests and the WAV fixture all use the same sound.
 */
export interface BowStroke {
  /** Sounding frequency in Hz, already including any intended intonation error. */
  freq: number;
  /** Seconds from the start of the stroke until the bow lifts. */
  duration: number;
  /** 0..1, default 0.8. */
  velocity?: number;
  /** Vibrato rate in Hz, default 5.6. */
  vibratoRate?: number;
  /** Vibrato depth in cents (peak), default 16. Zero for a straight tone. */
  vibratoDepth?: number;
  /** Seconds before the vibrato fades in, default 0.16. */
  vibratoDelay?: number;
  /** Starts this many cents off and slides into the note (a player correcting), default 0. */
  bend?: number;
  /** Time constant of that slide in seconds, default 0.6. */
  bendTime?: number;
}

const TWO_PI = Math.PI * 2;

/** PolyBLEP correction for a naive sawtooth: removes most of the aliasing at the reset. */
function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

export class ViolinVoice {
  readonly sampleRate: number;
  private readonly rand: () => number;
  private readonly body: Biquad[];
  private readonly noiseBand: Biquad;
  private stroke: Required<BowStroke> | null = null;
  private t = 0;
  private env = 0;
  private releasing = false;
  private ph1 = 0;
  private ph2 = 0.37;
  private vibPh = 0;
  private drift = 0;
  private detune: number;

  constructor(sampleRate: number, seed = 1, detuneCents = 2.5) {
    this.sampleRate = sampleRate;
    this.rand = mulberry32(seed);
    this.detune = detuneCents;
    const sr = sampleRate;
    this.body = [
      new Biquad(highpass(160, 0.7, sr)),
      new Biquad(peaking(285, 4, 7, sr)), // A0 air resonance
      new Biquad(peaking(470, 3, 5, sr)), // main wood mode
      new Biquad(peaking(1150, 1.2, -5, sr)),
      new Biquad(peaking(2800, 1.1, 6, sr)), // "bridge hill"
      new Biquad(lowpass(Math.min(7500, sr * 0.4), 0.7, sr)),
    ];
    this.noiseBand = new Biquad(bandpass(3200, 0.8, sr));
  }

  get active() {
    return this.stroke !== null;
  }

  play(stroke: BowStroke) {
    this.stroke = {
      velocity: 0.8,
      vibratoRate: 5.6,
      vibratoDepth: 16,
      vibratoDelay: 0.16,
      bend: 0,
      bendTime: 0.6,
      ...stroke,
    };
    this.t = 0;
    this.releasing = false;
    // Each stroke starts with its own small vibrato-rate variation.
    this.stroke.vibratoRate *= 0.95 + 0.1 * this.rand();
  }

  release() {
    this.releasing = true;
  }

  /** Adds the voice into out[start..end). */
  render(out: Float32Array, start = 0, end = out.length) {
    const s = this.stroke;
    if (!s) return;
    const sr = this.sampleRate;
    const attack = 1 - Math.exp(-1 / (0.022 * sr));
    const decay = Math.exp(-1 / (0.04 * sr));
    const up = 2 ** (this.detune / 2400);
    const down = 1 / up;
    const gain = 0.32 * s.velocity;
    for (let i = start; i < end; i++) {
      if (!this.releasing && this.t >= s.duration) this.releasing = true;

      // Bow envelope: exponential approach on attack, slight pressure swell, exponential release.
      if (this.releasing) {
        this.env *= decay;
        if (this.env < 1e-4) {
          this.env = 0;
          this.stroke = null;
          return;
        }
      } else {
        const target = 1 + 0.05 * Math.sin(TWO_PI * 0.8 * this.t);
        this.env += (target - this.env) * attack;
      }

      // Slow random pitch drift (a few tenths of a cent), updated every 64 samples.
      if ((i & 63) === 0) this.drift += -this.drift * 0.02 + 0.06 * gaussian(this.rand);

      const ramp = Math.min(1, Math.max(0, (this.t - s.vibratoDelay) / 0.3));
      const vibCents = s.vibratoDepth * ramp * ramp * (3 - 2 * ramp) * Math.sin(this.vibPh);
      this.vibPh += (TWO_PI * s.vibratoRate) / sr;
      if (this.vibPh > TWO_PI) this.vibPh -= TWO_PI;
      const bend = s.bend ? s.bend * Math.exp(-this.t / s.bendTime) : 0;
      const f = s.freq * 2 ** ((vibCents + this.drift + bend) / 1200);

      const dt1 = (f * up) / sr;
      const dt2 = (f * down) / sr;
      this.ph1 += dt1;
      if (this.ph1 >= 1) this.ph1 -= 1;
      this.ph2 += dt2;
      if (this.ph2 >= 1) this.ph2 -= 1;
      const saw = 0.62 * (2 * this.ph1 - 1 - polyBlep(this.ph1, dt1)) + 0.38 * (2 * this.ph2 - 1 - polyBlep(this.ph2, dt2));

      let y = saw;
      for (let k = 0; k < this.body.length; k++) y = this.body[k].process(y);

      // Bow hair noise, with a short scratch at the start of the stroke.
      const scratch = 0.035 + 0.25 * Math.exp(-this.t / 0.025);
      const noise = this.noiseBand.process(this.rand() * 2 - 1) * scratch;

      // Bowed tone loudness follows the vibrato slightly (bow-vibrato coupling).
      const tremor = 1 + 0.04 * ramp * Math.sin(this.vibPh + 0.6);
      out[i] += gain * this.env * (y * tremor + noise);
      this.t += 1 / sr;
    }
  }
}

export interface PhraseNote extends BowStroke {
  /** Start time in seconds from the beginning of the phrase. */
  start: number;
}

/** Renders a phrase offline: the reference input for tests and the fake-microphone WAV. */
export function renderPhrase(notes: PhraseNote[], sampleRate: number, seed = 7, tail = 0.4): Float32Array {
  const end = notes.reduce((e, n) => Math.max(e, n.start + n.duration), 0) + tail;
  const out = new Float32Array(Math.ceil(end * sampleRate));
  const voice = new ViolinVoice(sampleRate, seed);
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const n of sorted) {
    const at = Math.round(n.start * sampleRate);
    voice.render(out, cursor, at);
    voice.play(n);
    cursor = at;
  }
  voice.render(out, cursor, out.length);
  return out;
}
