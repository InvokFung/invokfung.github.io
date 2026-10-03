// Runs the built wasm module in node and checks it against the native build of
// the same C++ sources (build/native-summary.json, written by `make test`).
// The batch hash covers every layer record, path record and point, so equal
// hashes mean bit-identical toolpaths from g++/x86-64 and clang/wasm32.
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_PARAMS, PARAM_LAYOUT } from "../src/core/abi.ts";
import { LayerlineCore } from "../src/core/layerline.ts";
import { sliceContoursTS } from "../src/core/reference.ts";
import { parseStl } from "../src/mesh/stl.ts";

const root = new URL("../", import.meta.url);
const wasm = readFileSync(new URL("src/wasm/layerline.wasm", root));
const native = JSON.parse(readFileSync(new URL("build/native-summary.json", root), "utf8")) as Record<string, Record<string, number> & { contours: Record<string, number> }>;
const fixtures = readdirSync(new URL("tests/fixtures/", root)).filter((f) => f.endsWith(".stl")).sort();

/** Node pools small files, so a Buffer's .buffer can be larger than the file. */
function readStl(file: string) {
  const b = readFileSync(new URL(`tests/fixtures/${file}`, root));
  return parseStl(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, file);
}

function fnv1a(h: number, bytes: Uint8Array) {
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
  return h;
}

test("fixtures exist and match the native summary's file list", () => {
  assert.ok(fixtures.length >= 5);
  assert.deepEqual(fixtures, Object.keys(native).sort());
});

test("compiled-in defaults equal DEFAULT_PARAMS", async () => {
  const core = await LayerlineCore.load(wasm);
  const d = core.defaults();
  for (const [k, t] of PARAM_LAYOUT) assert.equal(d[k], t === "f32" ? Math.fround(DEFAULT_PARAMS[k]) : DEFAULT_PARAMS[k], k);
});

for (const file of fixtures) {
  test(`${file}: wasm toolpaths are bit-identical to the native build`, async () => {
    const core = await LayerlineCore.load(wasm);
    const mesh = readStl(file);
    const job = core.slice(mesh.positions, DEFAULT_PARAMS);
    let hash = 2166136261;
    for (let raw = job.nextRaw(16); raw; raw = job.nextRaw(16)) hash = fnv1a(hash, new Uint8Array(raw));
    const s = job.stats();
    const n = native[file];
    assert.equal(job.layers, n.layers);
    for (const k of ["segments", "loops", "islands", "holes", "paths", "points", "repaired", "dropped"] as const) assert.equal(s[k], n[k], k);
    assert.equal(hash, n.hash, "batch hash");
  });

  test(`${file}: TypeScript reference contours equal the wasm and native contours`, async () => {
    const core = await LayerlineCore.load(wasm);
    const mesh = readStl(file);
    const ts = sliceContoursTS(mesh.positions, 0.2);
    const { ms: _ms, ...w } = core.benchContours(mesh.positions, 0.2);
    assert.deepEqual(ts, native[file].contours);
    assert.deepEqual(w, native[file].contours);
  });
}

test("sample meshes are watertight: no open chains anywhere", () => {
  for (const f of fixtures) {
    assert.equal(native[f].repaired, 0, f);
    assert.equal(native[f].dropped, 0, f);
  }
});

test("hole detection: torus has one hole per layer, the gear six", () => {
  assert.equal(native["torus.stl"].holes, native["torus.stl"].layers);
  assert.equal(native["gear.stl"].holes, 6 * native["gear.stl"].layers);
});
