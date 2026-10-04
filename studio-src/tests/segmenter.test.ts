import { test } from "node:test";
import assert from "node:assert/strict";
import { NoteSegmenter, type PitchFrame } from "../src/dsp/segmenter";

const HOP = 512 / 48000;

/** Builds frames from [midi | null, count] runs. */
function frames(...runs: [number | null, number][]): PitchFrame[] {
  const out: PitchFrame[] = [];
  let t = 0;
  for (const [m, n] of runs)
    for (let i = 0; i < n; i++, t += HOP) out.push(m === null ? { t, midi: NaN, clarity: 0.2, db: -80 } : { t, midi: m, clarity: 0.97, db: -20 });
  return out;
}

function run(fs: PitchFrame[]) {
  const s = new NoteSegmenter();
  const events = fs.flatMap((f) => s.push(f));
  events.push(...s.flush());
  return { onsets: events.filter((e) => e.type === "onset"), ends: events.filter((e) => e.type === "end").map((e) => e.segment) };
}

test("separated notes become separate segments", () => {
  const { ends } = run(frames([null, 5], [67, 40], [null, 10], [69.1, 40], [null, 10]));
  assert.deepEqual(ends.map((s) => s.midi), [67, 69]);
  assert.ok(ends[0].frames.length >= 38);
});

test("legato change of note splits without a gap", () => {
  const { ends } = run(frames([62, 40], [64, 40], [66, 40]));
  assert.deepEqual(ends.map((s) => s.midi), [62, 64, 66]);
  assert.ok(Math.abs(ends[1].start - ends[0].end) < 2 * HOP);
});

test("a single octave-jumped frame or a short dropout does not split a note", () => {
  const { ends } = run(frames([69, 20], [81, 1], [69, 20], [null, 2], [69, 20]));
  assert.equal(ends.length, 1);
  assert.equal(ends[0].midi, 69);
});

test("vibrato of ±0.2 semitones stays one note", () => {
  const fs: PitchFrame[] = [];
  for (let i = 0; i < 120; i++) fs.push({ t: i * HOP, midi: 69 + 0.2 * Math.sin(2 * Math.PI * 5.5 * i * HOP), clarity: 0.95, db: -20 });
  assert.equal(run(fs).ends.length, 1);
});

test("too-short blips and quiet frames never start a note", () => {
  assert.equal(run(frames([null, 5], [70, 2], [null, 5])).ends.length, 0);
  const quiet = frames([69, 30]).map((f) => ({ ...f, db: -70 }));
  assert.equal(run(quiet).ends.length, 0);
});

test("onset is reported while the note is still sounding", () => {
  const s = new NoteSegmenter();
  const evs = frames([65, 3]).flatMap((f) => s.push(f));
  assert.equal(evs.length, 1);
  assert.equal(evs[0].type, "onset");
  assert.equal(s.active?.midi, 65);
});
