# Layerline

A 3D-printing slicer that runs in the browser. A freestanding C++ geometry core, compiled to a 66 KB WebAssembly module without Emscripten or a libc, slices STL meshes in a Web Worker and streams toolpaths, layer by layer, into a WebGL preview. Export gives Marlin G-code with a print-time and filament estimate. Live at **[invokfung.github.io/layerline](https://invokfung.github.io/layerline/)**.

- Load a binary or ASCII STL by drag and drop or the file picker, or pick one of four procedural samples (cube, involute gear, torus, twisted vase). Models are centred on a 220 × 220 mm bed with their triangle count, size and volume.
- Slicing re-runs as you change the layer height, line width, wall count, infill density and angle, or the number of top and bottom solid layers. The first layer is on screen in tens of milliseconds and the rest stream in behind it.
- The preview shows every extrusion as a bead, coloured by feature (outer wall, inner wall, sparse infill, solid infill, skirt, plus travel moves). A section plane follows the current layer: drag its handle (or use the scrubber or the arrow keys) to cut through the model. Above the plane the mesh stays as a ghost; in Model view the mesh is cut open at the plane.
- Play runs a nozzle along the toolpaths at the feed rates the G-code uses, laying the bead down behind it, with the estimated print clock.
- The page reports what each stage cost on your device and can run the WASM vs TypeScript benchmark locally.

## Architecture

```
 main thread    React UI, React Three Fiber scene           src/App.tsx, src/ui/, src/viewer/
                instanced extrusion shader, G-code download
      |  postMessage: mesh in (Float32Array); batches out, transferred
 Web Worker     protocol, adaptive batching, cancellation   src/worker/
                G-code writer and time estimate             src/gcode/gcode.ts
      |  typed wrapper: instantiate, write params, decode    src/core/layerline.ts, abi.ts
      |  C ABI: 11 functions, sizes checked at load          core/src/api.cpp
 WebAssembly    freestanding C++17 geometry core            core/src/
```

| Module | What it holds |
| --- | --- |
| `core/src/base.*` | Integer types, math on compiler builtins, an arena allocator over `memory.grow` (chunk chain, mark/release), `Vec<T>`, introsort, an open-addressing point hash |
| `core/src/geometry.*` | Integer points on a 1 µm grid, exact 64-bit orientation tests, winding numbers, Ramer–Douglas–Peucker simplification |
| `core/src/contours.*` | Layer plan, triangle buckets, triangle–plane intersection, stitching, island nesting |
| `core/src/polyops.*` | Miter offsetting and an N-ary boolean (union, intersection, difference, several rules in one pass) |
| `core/src/infill.*` | Rectilinear scanline infill and nearest-neighbour line ordering |
| `core/src/slicer.*` | The pipeline, per-layer state, wall reuse, skins, ordering, batch serialisation |
| `core/src/api.cpp` | The exported C ABI |
| `src/core/` | The TypeScript side of the ABI, a TypeScript reference of stage 1 for the benchmark, a toolpath store |
| `src/worker/` | The worker and its message protocol |
| `src/viewer/` | The 3D preview: instanced extrusions, section plane, playback timeline |

The worker asks the core for a few layers at a time and sizes each batch to about 12 ms of work, so small models do not pay a message per layer and big ones still stream. Between batches it yields to its event loop; a newer slice request (a slider moved) stops the older one at its next batch. Slices and benchmarks share the module's input buffer, so they run one at a time.

## Algorithms

1. **Layer plan and buckets.** Layers are planned from the first-layer and layer heights; each layer is sliced at its mid-height. Triangles are bucketed by the layers their z-range crosses with a counting sort into one flat array, so a layer only visits the triangles that cross it.
2. **Triangle–plane intersection.** Coordinates snap to a 1 µm integer grid. A vertex counts as above the plane when `z >= plane`, so a plane through a vertex never produces a degenerate crossing. Every crossing edge is interpolated from its lower to its upper vertex, so the two triangles sharing an edge produce bit-identical endpoints. Walking each triangle's edges in winding order, the edge that crosses from above to below starts the segment and the one crossing back ends it, so loops come out oriented.
3. **Stitching.** Segment starts go into a hash of quantised points. A segment's end is matched exactly first, then in the neighbouring cells; at a junction (several candidates) the leftmost turn wins, measured with a pseudo-angle, so touching loops separate cleanly. Chains that stay open are repaired: gaps up to 0.2 mm are bridged, including to reversed chains, which fixes meshes with flipped triangles. Repairs and dropped chains are counted and shown.
4. **Islands.** Loops are sorted by area and nested by winding tests: even depth is an outline (made counter-clockwise), odd depth a hole (made clockwise) attached to its tightest container. The torus therefore has one hole in every layer and the gear six.
5. **Perimeters.** Each wall is the outline moved inward by half a line width plus one width per wall: every edge is offset along its normal and neighbours are joined at the intersection of the moved edges (a miter), squared off where the miter would stick out more than twice the offset on a convex corner, bevelled past a ratio of 50 on a concave one. The raw offset is not a valid polygon in general: it self-intersects at concave corners and turns inside out where the part is thinner than the offset. It is cleaned by the N-ary boolean below, keeping the region of positive winding, and loops below a minimum area are dropped. A layer whose islands match the layer below within 27 µm (twice the simplification tolerance, symmetric vertex-to-edge distance) reuses its walls.
6. **N-ary boolean.** All edges of up to 16 input sets are split at their mutual crossings and touch points, with candidate pairs found on a uniform grid. Coincident sub-edges are grouped; for each group a test point just right of its midpoint gets every set's winding number from a sweep over the edges sorted by y, and the left side follows from the group's own ±1 crossings. A sub-edge is kept when the rule's answer differs on its two sides, oriented so the result is on its left, and kept edges are stitched back into loops. Rules are functions of a bit mask (inside set k or not), so several outputs share one pass.
7. **Top and bottom skins.** With the layer's infill area as set 0 and its top and bottom neighbours as the others, one boolean pass gives solid = set 0 minus the intersection of all neighbours and sparse = inside all of them. Layers next to an empty neighbour are solid outright, layers whose neighbours are identical are sparse outright, and the solid region is opened by half a line width to drop slivers. Infill regions narrower than one line width everywhere are left empty (there is no gap fill).
8. **Infill.** The region is rotated by the infill angle (negated on odd layers), cut by scanlines at `(k + 0.5) × spacing` on a grid shared by all layers, and the sorted crossings along each scanline are paired by the even-odd rule, so holes need no special handling. Lines shorter than a line width are dropped.
9. **Ordering.** Islands are visited nearest-first. Walls print from the innermost to the outer wall, each loop starting at the vertex nearest the back of the island so seams line up. Infill lines are linked greedily nearest-first, using a grid to find the next line.
10. **G-code and estimate.** Marlin dialect, absolute XYZ and relative E (`M83`). Extrusion per millimetre is the Slic3r bead cross-section `(w − h)·h + π(h/2)²` over the filament cross-section. Travels longer than 1.5 mm retract. Comments follow the Cura convention (`;LAYER:`, `;TYPE:`). The time estimate replays the moves through a lookahead planner: junction speeds from Marlin's junction deviation, a backward and a forward pass under constant acceleration, then a trapezoidal or triangular profile per move.
11. **Preview.** Each printed segment is one instance of a small six-sided bead mesh (32 bytes of instance data: endpoints, feature, layer and height), placed by a GLSL vertex shader, so a print with hundreds of thousands of segments is one draw call. Instances are stored in print order, so showing layers 0..L is just an instance count; the partially printed segment under the nozzle is a uniform. Batches are appended to the GPU buffer as they arrive.

## Why freestanding C++

Emscripten would bring a libc, a JavaScript loader and a larger binary for features this core never uses. The module is built with `clang --target=wasm32 -nostdlib -mbulk-memory -flto`: memory comes from an arena over `__builtin_wasm_memory_grow`, math comes from compiler builtins (plus a Taylor series for sine and cosine), and `memcpy`/`memset` lower to `memory.copy`/`memory.fill`. `-Wglobal-constructors -Werror` keeps every global constant-initialised, so the module needs no start function. It imports one function, a millisecond clock for the stage timings.

The same sources compile natively with g++ under AddressSanitizer and UndefinedBehaviorSanitizer for the unit tests. Both builds use integer geometry and `-ffp-contract=off`, and the parity test checks that they produce byte-identical toolpaths.

## Benchmarks

`npm run bench` times stage 1 (intersection and stitching) in WebAssembly against a TypeScript reference that implements the same algorithm with the same tie-breaking, using idiomatic structures (a `Map` keyed by strings, an object per segment); both must produce the same loops before a time counts. It also times the full WebAssembly pipeline with default settings. Node 22.22.0, Intel Xeon @ 2.10 GHz, 0.2 mm layers; each sample repeats the stage for at least 10 ms, and the table shows the median of 5 to 9 samples after warm-up:

| Model | Triangles | Layers | TS ms | WASM ms | Speed-up | WASM Mtri/s | WASM ms/layer | Full slice ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Cube | 12 | 100 | 2.1 | 0.1 | 34.2x | 0.20 | 0.001 | 1.2 |
| Gear | 3,104 | 40 | 37.4 | 4.4 | 8.5x | 0.70 | 0.110 | 21.1 |
| Torus | 16,384 | 70 | 27.3 | 3.4 | 7.9x | 4.75 | 0.049 | 149.6 |
| Vase | 92,880 | 320 | 144.9 | 17.9 | 8.1x | 5.19 | 0.056 | 208.4 |
| Dense torus | 262,144 | 70 | 107.4 | 20.0 | 5.4x | 13.10 | 0.286 | 159.1 |

Mtri/s is input triangles divided by the stage-1 time. The gear's tall flank triangles cross every layer, so it scores low there although its per-layer cost is small. The cube has 12 triangles over 100 layers, so its row measures per-layer overhead rather than geometry. The page shows these numbers (from `src/bench.json`) and can rerun the comparison on the visitor's device.

## Tests

`npm test` generates the fixture STLs from the sample generators, then:

- **21 native C++ tests, 520 checks** (`core/tests/test_core.cpp`, g++ with ASan and UBSan): arena, sort and hash basics; layer counts on a cube; a 128-sided cylinder's area within 0.01 mm²; one hole per torus layer; nested islands; stitching repair and flipped triangles; insets of squares, holes and an L-shape; thin parts that must collapse (strip, dumbbell, thin ring); spike squaring; booleans including a self-intersecting bow tie; rectilinear infill and line ordering; full cube toolpaths, overhang skins and the batch format.
- **17 Node tests** (`tests/*.test.ts`): the built `.wasm` runs in Node and must match the native build byte for byte on all five fixtures (an FNV-1a hash over every batch), the TypeScript reference must give the same contours as both, the compiled-in defaults must equal the TypeScript ones, the samples must be watertight, and the G-code for the cube is checked for layer structure, bounds, extrusion against the flow model and planner times with known answers.

## Build

Needs Node 22, clang/clang++ 18 with the wasm32 target and `wasm-ld`, and g++ with sanitizers.

```bash
cd layerline-src
npm install
npm run all      # make wasm -> tests (native + node) -> bench -> vite build into ../layerline
```

Single steps: `npm run wasm` (rebuilds `src/wasm/layerline.wasm`, which is checked in), `npm test`, `npm run bench` (rewrites `src/bench.json`), `npm run typecheck`, `npm run build` (Node only: it uses the checked-in wasm, so no clang is needed), `npm run dev`.

## Limitations

- No supports, bridging detection, ironing, adaptive layers or arc moves; one extruder; no per-model printer settings beyond the slicing parameters shown.
- No gap fill or thin-wall handling: features thinner than about two line widths lose their inner walls or disappear, and infill regions narrower than one line width stay empty.
- Offsetting is simplified: mitred or squared joins (no round joins), and validity comes from cleaning the raw offset with the boolean rather than from a true Minkowski offset. The boolean computes crossings in floating point and rounds them to the 1 µm grid; it does not snap-round, so rounding can in principle leave a tiny new crossing or sliver on adversarial input. Tiny loops are filtered by area.
- Wall reuse treats outlines within 27 µm as equal, so walls can differ from an exact per-layer offset by that much.
- The time estimate ignores heating, firmware-specific planner details and the fan; filament mass assumes PLA at 1.24 g/cm³.
- The mesh is sliced as a triangle soup: badly broken meshes (large holes, intersecting shells) give whatever loops the stitcher can close.
