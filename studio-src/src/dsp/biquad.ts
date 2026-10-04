/** RBJ "Audio EQ Cookbook" biquads, transposed direct form II. */
export interface BiquadCoefs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function normalise(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): BiquadCoefs {
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function lowpass(fc: number, q: number, sr: number): BiquadCoefs {
  const w = (2 * Math.PI * fc) / sr;
  const al = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  return normalise((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al);
}

export function highpass(fc: number, q: number, sr: number): BiquadCoefs {
  const w = (2 * Math.PI * fc) / sr;
  const al = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  return normalise((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
}

export function bandpass(fc: number, q: number, sr: number): BiquadCoefs {
  const w = (2 * Math.PI * fc) / sr;
  const al = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  return normalise(al, 0, -al, 1 + al, -2 * c, 1 - al);
}

export function peaking(fc: number, q: number, gainDb: number, sr: number): BiquadCoefs {
  const A = 10 ** (gainDb / 40);
  const w = (2 * Math.PI * fc) / sr;
  const al = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  return normalise(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A);
}

export class Biquad {
  private z1 = 0;
  private z2 = 0;
  constructor(private k: BiquadCoefs) {}

  process(x: number): number {
    const { b0, b1, b2, a1, a2 } = this.k;
    const y = b0 * x + this.z1;
    this.z1 = b1 * x - a1 * y + this.z2;
    this.z2 = b2 * x - a2 * y;
    return y;
  }

  reset() {
    this.z1 = this.z2 = 0;
  }
}
