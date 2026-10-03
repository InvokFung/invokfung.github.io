/**
 * Scales and arpeggios with correct spelling (F♯ in G major, E♯ in F♯ major,
 * B♯ in C♯ harmonic minor), and a graded set of drills per instrument.
 *
 * The grade lists are modelled on the shape of graded exam syllabuses (keys and
 * octave ranges widening grade by grade). They are not a copy of any board's
 * current requirements.
 */

export type Instrument = "violin" | "piano";
export type Mode = "major" | "minor";
export type ScaleForm = "scale" | "harmonic" | "melodic" | "arpeggio";

export interface DrillSpec {
  instrument: Instrument;
  /** Tonic spelling, e.g. "G", "Bb", "F#". */
  tonic: string;
  mode: Mode;
  /** "scale" for major; "harmonic" or "melodic" for minor scales; "arpeggio" for either. */
  form: ScaleForm;
  octaves: 1 | 2 | 3;
}

export interface DrillNote {
  midi: number;
  /** Letter name with accidental, e.g. "F♯". */
  name: string;
  octave: number;
  /** Scientific pitch notation, e.g. "F♯4". */
  label: string;
}

const LETTERS = "CDEFGAB";
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
const ACC_SIGNS: Record<number, string> = { [-2]: "𝄫", [-1]: "♭", 0: "", 1: "♯", 2: "𝄪" };

export const INSTRUMENT_RANGE: Record<Instrument, { low: number; high: number }> = {
  violin: { low: 55, high: 103 }, // G3 .. G7
  piano: { low: 21, high: 108 }, // A0 .. C8
};

/** Semitones above the tonic for each scale degree. */
const INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  melodicUp: [0, 2, 3, 5, 7, 9, 11],
  natural: [0, 2, 3, 5, 7, 8, 10],
};

export function parseTonic(tonic: string): { letter: number; acc: number } {
  const letter = LETTERS.indexOf(tonic[0].toUpperCase());
  if (letter < 0) throw new Error(`Bad tonic ${tonic}`);
  let acc = 0;
  for (const ch of tonic.slice(1)) acc += ch === "#" || ch === "♯" ? 1 : ch === "b" || ch === "♭" ? -1 : 0;
  return { letter, acc };
}

export const prettyTonic = (tonic: string) => tonic.replace("#", "♯").replace(/b$/, "♭");

/** Pitch class of a tonic spelling. */
export const tonicPc = (tonic: string) => {
  const { letter, acc } = parseTonic(tonic);
  return (((NATURAL_PC[letter] + acc) % 12) + 12) % 12;
};

/** The note `degree` letters and `semis` semitones above the tonic, spelled by letter. */
function spell(tonic: { letter: number; acc: number }, tonicMidi: number, degree: number, semis: number): DrillNote {
  const midi = tonicMidi + semis;
  const letterIdx = (tonic.letter + degree) % 7;
  // tonicMidi = 12·(octave + 1) + NATURAL_PC[letter] + acc, so the tonic's written octave is exact.
  const tonicOctave = (tonicMidi - NATURAL_PC[tonic.letter] - tonic.acc) / 12 - 1;
  const octave = tonicOctave + Math.floor((tonic.letter + degree) / 7);
  const natural = 12 * (octave + 1) + NATURAL_PC[letterIdx];
  const acc = midi - natural;
  const name = LETTERS[letterIdx] + (ACC_SIGNS[acc] ?? "?");
  return { midi, name, octave, label: `${name}${octave}` };
}

/** Lowest comfortable starting note for the tonic on this instrument. */
export function startMidi(spec: Pick<DrillSpec, "instrument" | "tonic" | "octaves">): number {
  const pc = tonicPc(spec.tonic);
  if (spec.instrument === "violin") {
    // Lowest tonic at or above G3 that still fits under the top of the range.
    let m = 55 + ((pc - 7 + 12) % 12);
    while (m + 12 * spec.octaves > INSTRUMENT_RANGE.violin.high) m -= 12;
    return m;
  }
  // Piano: start around C4 for one octave, C3 for more.
  return (spec.octaves === 1 ? 60 : 48) + pc;
}

/** Ascending then descending, the top note played once. */
export function buildDrill(spec: DrillSpec): DrillNote[] {
  const t = parseTonic(spec.tonic);
  const base = startMidi(spec);
  const up: DrillNote[] = [];
  const down: DrillNote[] = [];
  const minor = spec.mode === "minor";

  if (spec.form === "arpeggio") {
    const third = minor ? 3 : 4;
    const steps: [number, number][] = [
      [0, 0],
      [2, third],
      [4, 7],
    ];
    for (let o = 0; o < spec.octaves; o++) for (const [deg, s] of steps) up.push(spell(t, base, deg + 7 * o, s + 12 * o));
    up.push(spell(t, base, 7 * spec.octaves, 12 * spec.octaves));
    for (let i = up.length - 2; i >= 0; i--) down.push(up[i]);
    return [...up, ...down];
  }

  const ascending = !minor ? INTERVALS.major : spec.form === "melodic" ? INTERVALS.melodicUp : INTERVALS.harmonic;
  const descending = !minor ? INTERVALS.major : spec.form === "melodic" ? INTERVALS.natural : INTERVALS.harmonic;
  for (let o = 0; o < spec.octaves; o++) for (let d = 0; d < 7; d++) up.push(spell(t, base, d + 7 * o, ascending[d] + 12 * o));
  const top = spell(t, base, 7 * spec.octaves, 12 * spec.octaves);
  for (let o = spec.octaves - 1; o >= 0; o--) for (let d = 6; d >= 0; d--) down.push(spell(t, base, d + 7 * o, descending[d] + 12 * o));
  return [...up, top, ...down];
}

export function drillTitle(spec: DrillSpec): string {
  const key = `${prettyTonic(spec.tonic)} ${spec.mode}`;
  const what =
    spec.form === "arpeggio" ? "arpeggio" : spec.mode === "major" ? "scale" : spec.form === "melodic" ? "melodic minor" : "harmonic minor";
  const name = spec.form === "arpeggio" ? `${key} arpeggio` : spec.mode === "major" ? `${key} scale` : `${prettyTonic(spec.tonic)} ${what}`;
  return `${name} · ${spec.octaves} oct`;
}

export const drillId = (s: DrillSpec) => `${s.instrument}:${s.tonic}:${s.mode}:${s.form}:${s.octaves}`;

/** One key in a grade's list; the form (scale, arpeggio, minor type) is chosen in the UI. */
export interface SyllabusKey {
  tonic: string;
  mode: Mode;
  octaves: 1 | 2 | 3;
}

type Row = [string, 1 | 2 | 3];
const keys = (major: Row[], minor: Row[]): SyllabusKey[] => [
  ...major.map(([tonic, octaves]) => ({ tonic, mode: "major" as const, octaves })),
  ...minor.map(([tonic, octaves]) => ({ tonic, mode: "minor" as const, octaves })),
];

const ALL_MAJOR_VIOLIN = ["G", "Ab", "A", "Bb", "B", "C", "Db", "D", "Eb", "E", "F", "F#"];
const ALL_MINOR_VIOLIN = ["G", "G#", "A", "Bb", "B", "C", "C#", "D", "Eb", "E", "F", "F#"];

export const SYLLABUS: Record<Instrument, SyllabusKey[][]> = {
  violin: [
    keys([["D", 1], ["A", 1], ["G", 1]], [["A", 1], ["D", 1]]),
    keys([["G", 2], ["D", 1], ["A", 1], ["C", 1], ["F", 1]], [["A", 1], ["D", 1], ["E", 1]]),
    keys([["G", 2], ["A", 2], ["Bb", 2], ["C", 1], ["D", 1]], [["G", 2], ["A", 2], ["C", 1], ["D", 1]]),
    keys([["G", 3], ["Ab", 2], ["A", 2], ["Bb", 2], ["C", 2], ["D", 2], ["Eb", 2]], [["G", 2], ["A", 2], ["B", 2], ["C", 2], ["D", 2]]),
    keys([["G", 3], ["A", 3], ["Bb", 2], ["B", 2], ["C", 2], ["D", 2], ["E", 2], ["F", 2]], [["G", 3], ["A", 3], ["B", 2], ["C", 2], ["D", 2], ["E", 2], ["F#", 2]]),
    keys([["G", 3], ["Ab", 3], ["A", 3], ["Bb", 3], ["B", 3], ["C", 3], ["D", 3], ["Eb", 3]], [["G", 3], ["A", 3], ["Bb", 3], ["B", 3], ["C", 3], ["D", 3]]),
    keys(
      ALL_MAJOR_VIOLIN.filter((k) => k !== "Db" && k !== "F#").map((k) => [k, 3] as Row),
      ALL_MINOR_VIOLIN.filter((k) => k !== "G#" && k !== "C#").map((k) => [k, 3] as Row),
    ),
    keys(ALL_MAJOR_VIOLIN.map((k) => [k, 3] as Row), ALL_MINOR_VIOLIN.map((k) => [k, 3] as Row)),
  ],
  piano: [
    keys([["C", 1], ["G", 1], ["F", 1], ["D", 1]], [["A", 1], ["D", 1]]),
    keys([["C", 2], ["G", 2], ["D", 2], ["F", 2], ["A", 2]], [["A", 2], ["E", 2], ["D", 2]]),
    keys([["A", 2], ["E", 2], ["Bb", 2], ["Eb", 2]], [["B", 2], ["G", 2], ["C", 2]]),
    keys([["B", 2], ["Ab", 2], ["Db", 2], ["C", 3]], [["F#", 2], ["C#", 2], ["F", 2]]),
    keys([["C", 3], ["G", 3], ["D", 3], ["A", 3], ["E", 3], ["F", 3], ["Bb", 3]], [["A", 3], ["E", 3], ["D", 3], ["G", 3], ["C", 3]]),
    keys([["B", 3], ["F#", 3], ["Db", 3], ["Ab", 3], ["Eb", 3]], [["B", 3], ["F#", 3], ["C#", 3], ["F", 3], ["Bb", 3]]),
    keys(
      ["C", "G", "D", "A", "E", "B", "F#", "F", "Bb", "Eb", "Ab", "Db"].map((k) => [k, 3] as Row),
      ["A", "E", "B", "F#", "C#", "D", "G", "C", "F"].map((k) => [k, 3] as Row),
    ),
    keys(
      ["C", "G", "D", "A", "E", "B", "F#", "F", "Bb", "Eb", "Ab", "Db"].map((k) => [k, 3] as Row),
      ["A", "E", "B", "F#", "C#", "G#", "D", "G", "C", "F", "Bb", "Eb"].map((k) => [k, 3] as Row),
    ),
  ],
};
