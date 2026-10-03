/** Equal temperament around an adjustable reference A4 (MIDI note 69). */

export const DEFAULT_A4 = 440;
export const A4_MIN = 415;
export const A4_MAX = 445;

export const freqToMidi = (freq: number, a4 = DEFAULT_A4) => 69 + 12 * Math.log2(freq / a4);
export const midiToFreq = (midi: number, a4 = DEFAULT_A4) => a4 * 2 ** ((midi - 69) / 12);
export const cents = (freq: number, ref: number) => 1200 * Math.log2(freq / ref);

/** Nearest equal-tempered note and the deviation from it in cents (−50..50). */
export function nearestNote(freq: number, a4 = DEFAULT_A4): { midi: number; cents: number } {
  const m = freqToMidi(freq, a4);
  const midi = Math.round(m);
  return { midi, cents: (m - midi) * 100 };
}

const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

export const octaveOf = (midi: number) => Math.floor(midi / 12) - 1;
export const pitchClass = (midi: number) => ((midi % 12) + 12) % 12;
export const isBlackKey = (midi: number) => [1, 3, 6, 8, 10].includes(pitchClass(midi));

/** Note name without key context, e.g. "F♯" (or "G♭" with flats). */
export const pitchName = (midi: number, flats = false) => (flats ? FLAT_NAMES : SHARP_NAMES)[pitchClass(midi)];

/** Scientific pitch notation, e.g. 69 → "A4". */
export const noteLabel = (midi: number, flats = false) => `${pitchName(midi, flats)}${octaveOf(midi)}`;

export const formatCents = (c: number, digits = 0) => {
  const v = c.toFixed(digits);
  return Number(v) > 0 ? `+${v}` : Number(v) === 0 ? (0).toFixed(digits) : v;
};
