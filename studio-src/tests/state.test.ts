import { test } from "node:test";
import assert from "node:assert/strict";
import type { NoteSegment } from "../src/dsp/segmenter";
import { drillReducer, startDrill, summariseDrill, type DrillState } from "../src/state/drill";
import { computeStreak, loadSessions, noteStats, saveSessions, summarise, type SessionRecord } from "../src/state/history";
import { createStorage } from "../src/state/storage";

const HOP = 512 / 48000;

/** A held note: `seconds` long at `midi` plus `cents`, with ±10 cent vibrato at 5.5 Hz. */
function note(midi: number, cents: number, start: number, seconds = 1): NoteSegment {
  const frames = [];
  for (let t = start; t < start + seconds; t += HOP) frames.push({ t, midi: midi + cents / 100 + 0.1 * Math.sin(2 * Math.PI * 5.5 * t), db: -20 });
  return { start, end: start + seconds, midi, frames };
}

const spec = { instrument: "violin" as const, tonic: "D", mode: "major" as const, form: "arpeggio" as const, octaves: 1 as const };

test("drill: matching notes advance and are scored; wrong notes are counted, not advanced", () => {
  let s: DrillState = startDrill(spec, "mic", 0);
  assert.deepEqual(
    s.notes.map((n) => n.label),
    ["D4", "F♯4", "A4", "D5", "A4", "F♯4", "D4"],
  );
  s = drillReducer(s, { type: "phase", phase: "listen" });
  s = drillReducer(s, { type: "segment", segment: note(62, 6, 0), at: 1 });
  assert.equal(s.index, 1);
  assert.ok(Math.abs(s.results[0].cents - 6) < 0.5, `cents ${s.results[0].cents}`);

  // G4 instead of F♯4: counted as wrong, the drill waits.
  s = drillReducer(s, { type: "segment", segment: note(67, 0, 1), at: 2 });
  assert.equal(s.index, 1);
  assert.equal(s.wrong, 1);
  assert.equal(s.lastWrong?.heard, "G4");
  assert.equal(s.lastWrong?.expected, "F♯4");

  // A blip shorter than the minimum is ignored.
  s = drillReducer(s, { type: "segment", segment: note(66, 0, 2, 0.05), at: 3 });
  assert.equal(s.index, 1);

  // 40 cents sharp is still that note (within a quarter-tone), just badly out of tune.
  s = drillReducer(s, { type: "segment", segment: note(66, 40, 3), at: 4 });
  assert.equal(s.index, 2);
  assert.equal(s.results[1].rating, "sharp");
  assert.ok(s.results[1].score < s.results[0].score);
  assert.equal(s.lastWrong, null);
});

test("drill: finishing, skipping, and the summary", () => {
  let s = startDrill(spec, "demo", 10);
  const offsets = [0, -4, 8, 12, -2, 3, -15];
  s.notes.forEach((n, i) => {
    s = drillReducer(s, { type: "segment", segment: note(n.midi, offsets[i], 1.5 * i), at: 11 + i });
  });
  assert.equal(s.phase, "done");
  assert.equal(s.endedAt, 17);
  // Events after the end change nothing.
  assert.equal(drillReducer(s, { type: "skip", at: 20 }), s);

  const sum = summariseDrill(s);
  assert.equal(sum.played, 7);
  assert.equal(sum.inTune, 5);
  assert.equal(sum.worst?.label, "D4");
  assert.ok(Math.abs(sum.meanAbs - 44 / 7) < 0.5, `meanAbs ${sum.meanAbs}`);
  assert.ok(sum.vibrato && Math.abs(sum.vibrato.rate - 5.5) < 0.4, `vibrato ${JSON.stringify(sum.vibrato)}`);

  let k = startDrill(spec, "mic", 0);
  for (let i = 0; i < k.notes.length; i++) k = drillReducer(k, { type: "skip", at: i });
  assert.equal(k.phase, "done");
  assert.equal(k.results.length, 0);
  assert.equal(summariseDrill(k).score, 0);
});

test("streak: consecutive local days, today optional", () => {
  const day = (d: number, h = 18) => new Date(2026, 9, d, h).getTime();
  const now = day(10, 9);
  assert.deepEqual(computeStreak([], now), { current: 0, best: 0, practisedToday: false });
  // 7, 8, 9 practised; today (10) not yet: the streak is still alive.
  assert.deepEqual(computeStreak([day(7), day(8), day(9), day(9, 20)], now), { current: 3, best: 3, practisedToday: false });
  assert.deepEqual(computeStreak([day(7), day(8), day(9), day(10, 8)], now), { current: 4, best: 4, practisedToday: true });
  // A gap yesterday breaks it; the best run is remembered. Month boundaries are fine.
  assert.deepEqual(computeStreak([new Date(2026, 8, 29, 12).getTime(), new Date(2026, 8, 30, 12).getTime(), day(1), day(2), day(5), day(10, 8)], now), {
    current: 1,
    best: 4,
    practisedToday: true,
  });
});

test("history: per-note averages and totals", () => {
  const rec = (notes: [number, number][], seconds: number): SessionRecord => ({
    id: String(seconds),
    at: 0,
    source: "mic",
    instrument: "violin",
    drillId: "x",
    title: "x",
    a4: 440,
    notes: notes.map(([m, c]) => [m, c, 1, 90]),
    wrong: 0,
    score: 90,
    seconds,
  });
  const sessions = [rec([[69, 4], [71, -12]], 30), rec([[69, 10], [73, 2]], 90)];
  const stats = noteStats(sessions);
  assert.deepEqual(stats.get(69), { midi: 69, count: 2, mean: 7, meanAbs: 7 });
  assert.equal(stats.get(71)?.mean, -12);
  const sum = summarise(sessions);
  assert.equal(sum.notes, 4);
  assert.equal(sum.inTune, 0.75);
  assert.equal(sum.minutes, 2);
});

test("storage: survives a throwing or missing localStorage", () => {
  const map = new Map<string, string>();
  const ok = createStorage({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) });
  assert.equal(ok.persistent, true);
  assert.equal(saveSessions(ok, []), true);
  assert.deepEqual(loadSessions(ok), []);

  const throwing = createStorage({
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  });
  assert.equal(throwing.persistent, false);
  assert.equal(throwing.write("k", { a: 1 }), false, "reports that nothing was persisted");
  assert.deepEqual(throwing.read("k", null), { a: 1 }, "but keeps it for this visit");
  throwing.remove("k");
  assert.equal(throwing.read("k", "gone"), "gone");

  const none = createStorage(null);
  assert.equal(none.persistent, false);
  // Corrupt or foreign data is ignored rather than crashing the page.
  map.set("intonation-studio:v1:sessions", "{not json");
  assert.deepEqual(loadSessions(ok), []);
  map.set("intonation-studio:v1:sessions", JSON.stringify([{ nope: 1 }, null]));
  assert.deepEqual(loadSessions(ok), []);
});
