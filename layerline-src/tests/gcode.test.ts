// G-code from real toolpaths (the wasm slice of the 20 mm cube), plus the
// flow model and the planner on cases with known answers.
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_PARAMS } from "../src/core/abi.ts";
import { LayerlineCore } from "../src/core/layerline.ts";
import { Toolpaths } from "../src/core/toolpaths.ts";
import { DEFAULT_PROFILE, generateGcode, lineArea, plannerTime } from "../src/gcode/gcode.ts";
import { placeOnBed } from "../src/mesh/mesh.ts";
import { cube } from "../src/mesh/samples.ts";

const wasm = readFileSync(new URL("../src/wasm/layerline.wasm", import.meta.url));

async function sliceCube() {
  const core = await LayerlineCore.load(wasm);
  const job = core.slice(placeOnBed(cube()).positions, DEFAULT_PARAMS);
  const tp = new Toolpaths(job.layers);
  for (let b = job.next(8); b; b = job.next(8)) tp.append(b);
  return tp;
}

test("cube G-code: one ;LAYER block per layer, rising Z, Marlin start and end", async () => {
  const tp = await sliceCube();
  const { text, estimate } = generateGcode(tp, DEFAULT_PARAMS, DEFAULT_PROFILE, { emit: true, modelName: "cube" });
  const lines = text!.split("\n");
  const layers = lines.filter((l) => l.startsWith(";LAYER:"));
  assert.equal(layers.length, 100);
  const zs = lines.filter((l) => l.startsWith(";Z:")).map((l) => Number(l.slice(3)));
  assert.equal(zs[0], 0.2);
  assert.equal(zs.at(-1), 20);
  for (let i = 1; i < zs.length; i++) assert.ok(zs[i] > zs[i - 1]);
  for (const cmd of ["G28", "M83", "M109 S210", "M190 S60"]) assert.ok(lines.some((l) => l.startsWith(cmd)), cmd);
  assert.ok(lines.at(-2)!.startsWith("M84"));
  assert.ok(!text!.includes("ESTIMATE_PLACEHOLDER"));
  // Every extruding move of the print (after the purge line) stays near the
  // cube, centred at (110, 110), and pushes filament forward.
  let extrusions = 0;
  for (const l of lines.slice(lines.indexOf(";LAYER:0"), lines.indexOf(";END"))) {
    const m = /^G1 X([\d.]+) Y([\d.]+) E([\d.-]+)/.exec(l);
    if (!m) continue;
    extrusions++;
    const [x, y, e] = [Number(m[1]), Number(m[2]), Number(m[3])];
    assert.ok(x > 80 && x < 140 && y > 80 && y < 140, l);
    assert.ok(e > 0, l);
  }
  assert.ok(extrusions > 1000);
  assert.ok(estimate.seconds > 600 && estimate.seconds < 3 * 3600, `estimate ${estimate.seconds}`);
});

test("extruded filament matches the flow model over the extruded length", async () => {
  const tp = await sliceCube();
  const { text, estimate } = generateGcode(tp, DEFAULT_PARAMS, DEFAULT_PROFILE, { emit: true });
  const lines = text!.split("\n");
  // Sum E of model moves (after the first ;LAYER:, before ;END), excluding retract/prime moves.
  const from = lines.findIndex((l) => l.startsWith(";LAYER:"));
  const to = lines.indexOf(";END");
  let e = 0;
  for (const l of lines.slice(from, to)) {
    const m = /^G1 X[\d.]+ Y[\d.]+ E([\d.]+)/.exec(l);
    if (m) e += Number(m[1]);
  }
  const filArea = Math.PI * (DEFAULT_PROFILE.filamentDiameter / 2) ** 2;
  const printed = estimate.byKind.slice(0, 5).reduce((a, k) => a + k.length, 0);
  // All layers are 0.2 mm here, so E = length * lineArea / filament area (to the printed 5 decimals).
  const expected = (printed * lineArea(DEFAULT_PARAMS.lineWidth, 0.2)) / filArea;
  assert.ok(Math.abs(e - expected) / expected < 1e-4, `${e} vs ${expected}`);
});

test("planner: a long straight move takes L/v + v/a; a reversal stops at the corner", () => {
  const a = 1000,
    v = 50,
    L = 100;
  assert.ok(Math.abs(plannerTime([L], [v], [1], a, 0.013) - (L / v + v / a)) < 1e-9);
  // Two collinear moves behave like one.
  assert.ok(Math.abs(plannerTime([L / 2, L / 2], [v, v], [1, 1], a, 0.013) - (L / v + v / a)) < 1e-9);
  // A full reversal forces a stop: twice the single-move time for half the length each.
  const half = plannerTime([L / 2], [v], [1], a, 0.013);
  assert.ok(Math.abs(plannerTime([L / 2, L / 2], [v, v], [1, -1], a, 0.013) - 2 * half) < 1e-9);
});
