/**
 * Intonation colours. Direction is a diverging scale: flat = cyan, sharp =
 * amber, with a neutral pale midpoint for "in tune". Text labels and signs
 * (+/−, ♭/♯) always accompany the colour, so it never carries meaning alone.
 */
type RGB = [number, number, number];

const FLAT: RGB = [34, 211, 238]; // #22d3ee
const SHARP: RGB = [245, 158, 11]; // #f59e0b
const MID: RGB = [203, 213, 225]; // #cbd5e1
export const WRONG = "#fb7185";
export const GOOD = "#34d399";

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Saturates at ±`full` cents. Within ±3 cents the colour stays at the midpoint. */
export function centsRgb(cents: number, full = 30): RGB {
  const t = Math.min(1, Math.max(0, (Math.abs(cents) - 3) / (full - 3)));
  const eased = t * t * (3 - 2 * t);
  return mix(MID, cents < 0 ? FLAT : SHARP, eased);
}

export const centsColor = (cents: number, full = 30) => {
  const [r, g, b] = centsRgb(cents, full);
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
};

export const FLAT_HEX = "#22d3ee";
export const SHARP_HEX = "#f59e0b";
export const MID_HEX = "#cbd5e1";
