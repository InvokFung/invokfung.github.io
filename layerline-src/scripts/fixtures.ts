// Writes every sample model as a binary STL into tests/fixtures, placed on the
// bed exactly as the app places it. The native tests and the wasm parity test
// both slice these files.
import { mkdirSync, writeFileSync } from "node:fs";
import { cylinder, SAMPLES } from "../src/mesh/samples.ts";
import { placeOnBed } from "../src/mesh/mesh.ts";
import { writeBinaryStl } from "../src/mesh/stl.ts";

const dir = new URL("../tests/fixtures/", import.meta.url);
mkdirSync(dir, { recursive: true });
const models = [...SAMPLES.map((s) => ({ id: s.id, mesh: s.make() })), { id: "cylinder", mesh: cylinder() }];
for (const { id, mesh } of models) {
  const placed = placeOnBed(mesh);
  writeFileSync(new URL(`${id}.stl`, dir), new Uint8Array(writeBinaryStl(placed)));
  console.log(`fixtures/${id}.stl  ${(placed.positions.length / 9).toLocaleString("en-US")} triangles`);
}
