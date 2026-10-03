import { test } from "node:test";
import assert from "node:assert/strict";
import { INSTRUMENT_RANGE, SYLLABUS, buildDrill, drillTitle, type DrillSpec } from "../src/dsp/theory";

const labels = (s: DrillSpec) => buildDrill(s).map((n) => n.label).join(" ");

test("G major, two octaves, on the violin", () => {
  const notes = buildDrill({ instrument: "violin", tonic: "G", mode: "major", form: "scale", octaves: 2 });
  assert.equal(notes.length, 29);
  assert.equal(notes[0].label, "G3");
  assert.equal(notes[14].label, "G5");
  assert.equal(notes[6].label, "F♯4");
  assert.equal(notes[28].label, "G3");
});

test("spelling follows the key, not the black keys", () => {
  assert.equal(labels({ instrument: "violin", tonic: "F#", mode: "major", form: "scale", octaves: 1 }), "F♯4 G♯4 A♯4 B4 C♯5 D♯5 E♯5 F♯5 E♯5 D♯5 C♯5 B4 A♯4 G♯4 F♯4");
  assert.equal(labels({ instrument: "violin", tonic: "C#", mode: "minor", form: "harmonic", octaves: 1 }), "C♯4 D♯4 E4 F♯4 G♯4 A4 B♯4 C♯5 B♯4 A4 G♯4 F♯4 E4 D♯4 C♯4");
  // B♯4 is the same key as C5 (MIDI 72) but belongs to octave 4.
  assert.equal(buildDrill({ instrument: "violin", tonic: "C#", mode: "minor", form: "harmonic", octaves: 1 })[6].midi, 72);
});

test("melodic minor goes up raised and comes down natural", () => {
  assert.equal(labels({ instrument: "violin", tonic: "D", mode: "minor", form: "melodic", octaves: 1 }), "D4 E4 F4 G4 A4 B4 C♯5 D5 C5 B♭4 A4 G4 F4 E4 D4");
  assert.equal(labels({ instrument: "piano", tonic: "Eb", mode: "minor", form: "melodic", octaves: 1 }), "E♭4 F4 G♭4 A♭4 B♭4 C5 D5 E♭5 D♭5 C♭5 B♭4 A♭4 G♭4 F4 E♭4");
});

test("arpeggios", () => {
  assert.equal(labels({ instrument: "violin", tonic: "A", mode: "major", form: "arpeggio", octaves: 2 }), "A3 C♯4 E4 A4 C♯5 E5 A5 E5 C♯5 A4 E4 C♯4 A3");
  assert.equal(labels({ instrument: "piano", tonic: "C", mode: "minor", form: "arpeggio", octaves: 1 }), "C4 E♭4 G4 C5 G4 E♭4 C4");
});

test("every syllabus drill fits its instrument and has no repeated adjacent notes", () => {
  let count = 0;
  for (const instrument of ["violin", "piano"] as const) {
    assert.equal(SYLLABUS[instrument].length, 8, "eight grades");
    const range = INSTRUMENT_RANGE[instrument];
    for (const grade of SYLLABUS[instrument])
      for (const k of grade)
        for (const form of k.mode === "major" ? (["scale", "arpeggio"] as const) : (["harmonic", "melodic", "arpeggio"] as const)) {
          const spec: DrillSpec = { instrument, tonic: k.tonic, mode: k.mode, form, octaves: k.octaves };
          const notes = buildDrill(spec);
          count++;
          assert.ok(notes.every((n) => n.midi >= range.low && n.midi <= range.high), drillTitle(spec));
          assert.ok(notes.every((n) => !n.label.includes("?")), `spelling ${drillTitle(spec)}`);
          for (let i = 1; i < notes.length; i++) assert.notEqual(notes[i].midi, notes[i - 1].midi);
        }
  }
  assert.ok(count > 250);
});
