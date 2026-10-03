// Benchmarks stage 1 (triangle-plane intersection + stitching) in the wasm
// core against the TypeScript reference, plus the full wasm pipeline, on every
// sample and a dense stress mesh. Writes src/bench.json for the app's
// "How it works" panel and prints a Markdown table for the README.
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { DEFAULT_PARAMS } from "../src/core/abi.ts";
import { LayerlineCore } from "../src/core/layerline.ts";
import { sliceContoursTS } from "../src/core/reference.ts";
import { placeOnBed } from "../src/mesh/mesh.ts";
import { SAMPLES, torus } from "../src/mesh/samples.ts";

const wasm = readFileSync(new URL("../src/wasm/layerline.wasm", import.meta.url));
const core = await LayerlineCore.load(wasm);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const models = [
  ...SAMPLES.map((s) => ({ id: s.id, label: s.label, mesh: placeOnBed(s.make()) })),
  { id: "torus-dense", label: "Dense torus", mesh: placeOnBed(torus(18, 7, 512, 256)) },
];

const rows = [];
for (const { id, label, mesh } of models) {
  const tris = mesh.positions.length / 9;
  const runs = tris > 100_000 ? 5 : 9;
  const ts: number[] = [],
    wa: number[] = [],
    full: number[] = [];
  let layers = 0;
  for (let r = 0; r < runs + 2; r++) {
    // Each sample repeats its stage for at least 10 ms (the cube takes ~0.1 ms).
    let n = 0,
      tsMs = 0,
      ref: ReturnType<typeof sliceContoursTS>;
    const t0 = performance.now();
    do {
      ref = sliceContoursTS(mesh.positions, 0.2);
      n++;
      tsMs = performance.now() - t0;
    } while (tsMs < 10);
    const w = core.benchContours(mesh.positions, 0.2, 10);
    if (ref.loops !== w.loops || ref.points !== w.points) throw new Error(`${id}: TS and wasm disagree`);
    layers = w.layers;
    const t2 = performance.now();
    const job = core.slice(mesh.positions, DEFAULT_PARAMS);
    while (job.next(16)) {}
    const t3 = performance.now();
    if (r < 2) continue; // warm-up: JIT tiers and wasm memory growth
    ts.push(tsMs / n);
    wa.push(w.ms);
    full.push(t3 - t2);
  }
  const row = {
    id,
    label,
    triangles: tris,
    layers,
    tsMs: median(ts),
    wasmMs: median(wa),
    fullMs: median(full),
  };
  rows.push(row);
}

const result = {
  measuredAt: new Date().toISOString().slice(0, 10),
  runtime: `Node ${process.versions.node} (V8 ${process.versions.v8})`,
  cpu: os.cpus()[0]?.model.replace(/\s+/g, " ").trim() ?? "unknown",
  wasmBytes: wasm.byteLength,
  layerHeight: 0.2,
  rows,
};
writeFileSync(new URL("../src/bench.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");

const fmt = (n: number, d = 1) => n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
console.log(`${result.runtime}, ${result.cpu}; wasm ${result.wasmBytes} bytes; layer height 0.2 mm; median of ${"5-9"} runs\n`);
console.log("| Model | Triangles | Layers | TS ms | WASM ms | Speed-up | WASM Mtri/s | WASM ms/layer | Full slice ms |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const r of rows)
  console.log(
    `| ${r.label} | ${r.triangles.toLocaleString("en-US")} | ${r.layers} | ${fmt(r.tsMs)} | ${fmt(r.wasmMs)} | ${fmt(r.tsMs / r.wasmMs)}x | ${fmt(r.triangles / r.wasmMs / 1000, 2)} | ${fmt(r.wasmMs / r.layers, 3)} | ${fmt(r.fullMs)} |`,
  );
