import { test } from "node:test";
import assert from "node:assert/strict";
import { pipelineAccuracy } from "./accuracy";

test("end to end: synthesized violin drill → stream analyser → segmenter → scoring", () => {
  const r = pipelineAccuracy();
  assert.equal(r.segments, r.expected, "one segment per note");
  r.notes.forEach((n, i) => assert.equal(n.detectedMidi, Math.round(n.detectedMidi), `note ${i}`));
  assert.ok(r.max < 2, `intonation recovered within 2 cents (median ${r.median.toFixed(2)}, max ${r.max.toFixed(2)})`);
  const withVibrato = r.notes.filter((n) => n.vibrato);
  assert.ok(withVibrato.length >= r.expected * 0.8, "vibrato found on most notes");
  for (const n of withVibrato) assert.ok(n.vibrato!.rate > 5 && n.vibrato!.rate < 6.2, `rate ${n.vibrato!.rate.toFixed(2)} Hz`);
});
