/** Root mean square of a frame. */
export function rms(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
}

/** Level in dB relative to full scale, floored at −120. */
export const toDb = (amplitude: number) => (amplitude > 1e-6 ? 20 * Math.log10(amplitude) : -120);

/** Maps −60..0 dBFS onto 0..1 for meters and visuals. */
export const dbToUnit = (db: number, floor = -60) => Math.max(0, Math.min(1, (db - floor) / -floor));
