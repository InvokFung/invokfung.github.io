import { useState, type ReactNode } from "react";
import benchData from "../bench.json";
import type { Stats } from "../core/abi";
import type { Mesh } from "../mesh/mesh";
import type { BenchResult } from "../worker/protocol";
import { fmt, kb, ms } from "./format";

export const SOURCE = "https://github.com/InvokFung/invokfung.github.io/tree/main/layerline-src";
const src = (path: string) => `${SOURCE}/${path}`;

/** Test counts as printed by `npm test` (core/tests/test_core.cpp, tests/*.test.ts). */
export const TESTS = { native: 21, checks: 520, node: 17 };

interface BenchRow {
  id: string;
  label: string;
  triangles: number;
  layers: number;
  tsMs: number;
  wasmMs: number;
  fullMs: number;
}
const BENCH = benchData as { measuredAt: string; runtime: string; cpu: string; wasmBytes: number; layerHeight: number; rows: BenchRow[] };
const speedups = BENCH.rows.filter((r) => r.triangles >= 1000).map((r) => r.tsMs / r.wasmMs);
const sorted = [...speedups].sort((a, b) => a - b);
const mid = sorted.length >> 1;
export const MEDIAN_SPEEDUP = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
const GEAR = BENCH.rows.find((r) => r.id === "gear")!;

/* ------------------------------------------------------------------ how it works */

// Small line drawings of each step (viewBox 64 x 36).
const GLYPHS: Record<string, ReactNode> = {
  "01": (
    <>
      <path className="g-dim" d="M4 30h56M4 23h56M4 16h56M4 9h56" />
      <path className="g-c" d="M18 32 30 5l16 21Z" />
      <path className="g-a" d="M23.5 23h18.6M26.6 16h11.5" />
    </>
  ),
  "02": (
    <>
      <path className="g-dim" d="M8 30 20 6l12 22L44 6l12 24" />
      <path className="g-dim" d="M4 18h56" />
      <circle className="g-a" cx="14" cy="18" r="1.8" />
      <circle className="g-a" cx="25.6" cy="18" r="1.8" />
      <circle className="g-a" cx="38.2" cy="18" r="1.8" />
      <circle className="g-a" cx="50" cy="18" r="1.8" />
      <path className="g-c" d="M14 18h36" />
    </>
  ),
  "03": (
    <>
      <rect className="g-c" x="6" y="4" width="52" height="28" rx="7" />
      <rect className="g-a" x="10" y="8" width="44" height="20" rx="4" />
      <rect className="g-i" x="14" y="12" width="36" height="12" rx="2" />
    </>
  ),
  "04": (
    <>
      <path className="g-dim" d="M8 30h48M8 26h48M8 22h48" />
      <path className="g-g" d="M8 18h48M8 14h48" />
      <path className="g-dim" d="M18 10h28M22 6h20" />
    </>
  ),
  "05": (
    <>
      <rect className="g-dim" x="8" y="4" width="48" height="28" rx="3" />
      <path className="g-c" d="M8 16 20 4M8 28 32 4M16 32 44 4M28 32 56 4M40 32l16-16" />
    </>
  ),
  "06": (
    <>
      <path className="g-dim" d="M10 28 22 10l14 14 18-16" />
      <circle className="g-a" cx="10" cy="28" r="2.4" />
      <circle className="g-c" cx="22" cy="10" r="2" />
      <circle className="g-c" cx="36" cy="24" r="2" />
      <path className="g-a" d="m48 7 6 1-1 6" />
    </>
  ),
  "07": (
    <text className="g-t" x="4" y="15">
      <tspan x="4">G1 X41.2</tspan>
      <tspan x="4" dy="13">
        E0.0412
      </tspan>
    </text>
  ),
};

const STEPS: { n: string; title: string; stat?: keyof Stats; body: string; file: string }[] = [
  {
    n: "01",
    title: "Bucket",
    stat: "msSetup",
    body: "Layer planes sit at mid-layer heights. Triangles go into per-layer buckets by their z-range with a counting sort into one flat array, so a layer only visits the triangles that cross it.",
    file: "core/src/contours.cpp",
  },
  {
    n: "02",
    title: "Intersect, stitch, nest",
    stat: "msContours",
    body: "Each crossing triangle gives a directed segment on a 1 µm integer grid; shared edges are interpolated in one canonical direction, so neighbours produce bit-identical endpoints. A hash of endpoints chains segments into loops (leftmost turn at junctions, gaps under 0.2 mm bridged, flipped triangles repaired). Nesting depth separates outlines from holes.",
    file: "core/src/contours.cpp",
  },
  {
    n: "03",
    title: "Walls",
    stat: "msWalls",
    body: "Each perimeter offsets the outline inward with mitred corners (squared off past the miter limit). The raw offset can self-intersect, so it goes through an N-ary boolean: edges split at crossings found on a uniform grid, winding numbers from a y-sweep, kept edges re-stitched. Layers that match the one below within 27 µm reuse its walls.",
    file: "core/src/polyops.cpp",
  },
  {
    n: "04",
    title: "Top and bottom skins",
    stat: "msSkins",
    body: "Solid infill is this layer's infill area minus the intersection of its top and bottom neighbours; the rest is sparse. Both come from one pass of the boolean over up to 16 sets, then an opening by half a line width drops slivers.",
    file: "core/src/slicer.cpp",
  },
  {
    n: "05",
    title: "Infill",
    stat: "msInfill",
    body: "Rectilinear scanlines on a global grid, rotated ±45° on alternating layers. Crossings along each scanline pair up by the even-odd rule, so holes need no special case.",
    file: "core/src/infill.cpp",
  },
  {
    n: "06",
    title: "Order",
    stat: "msOrder",
    body: "Islands are visited nearest-first and infill lines nearest-first through a grid; walls print innermost to outermost with the seam at the back. Finished layers are serialised into one flat batch and transferred to the page.",
    file: "core/src/slicer.cpp",
  },
  {
    n: "07",
    title: "G-code and estimate",
    body: "Marlin G1 moves with E from the Slic3r flow model and the filament diameter, retraction on long travels. The time estimate replays the moves through a junction-deviation lookahead planner with trapezoidal speed profiles.",
    file: "src/gcode/gcode.ts",
  },
];

export function HowItWorks({ stats, model, sliceMs, firstLayerMs }: { stats: Stats | null; model: string; sliceMs: number; firstLayerMs: number }) {
  const max = stats ? Math.max(...STEPS.map((s) => (s.stat ? stats[s.stat] : 0))) : 1;
  return (
    <section className="section" id="how" aria-labelledby="how-title">
      <p className="eyebrow">How it works</p>
      <h2 id="how-title">From triangles to toolpaths in seven steps</h2>
      <p className="section-lede">
        Steps 01 to 06 run in C++ compiled to WebAssembly inside a Web Worker; timings are from the last slice{stats ? ` of the ${model.toLowerCase()} on this device` : ""}.
      </p>
      <ol className="steps">
        {STEPS.map((s) => {
          const v = stats && s.stat ? stats[s.stat] : null;
          return (
            <li key={s.n}>
              <svg className="glyph" viewBox="0 0 64 36" aria-hidden>
                {GLYPHS[s.n]}
              </svg>
              <div className="step-head">
                <span className="n mono">{s.n}</span>
                <h3>{s.title}</h3>
                <span className="mono t">{v !== null ? ms(v) : s.stat ? "–" : "TypeScript"}</span>
              </div>
              {s.stat && (
                <span className="bar" aria-hidden>
                  <i style={{ width: `${v !== null ? Math.max(1, (v / max) * 100) : 0}%` }} />
                </span>
              )}
              <p>{s.body}</p>
              <a className="file mono" href={src(s.file)} target="_blank" rel="noopener">
                {s.file}
              </a>
            </li>
          );
        })}
        <li className="summary">
          <div className="step-head">
            <span className="n mono">Σ</span>
            <h3>This slice</h3>
          </div>
          <dl>
            <div>
              <dt>Slice time (worker)</dt>
              <dd className="mono">{stats ? ms(sliceMs) : "–"}</dd>
            </div>
            <div>
              <dt>First layer on screen</dt>
              <dd className="mono">{stats ? ms(firstLayerMs) : "–"}</dd>
            </div>
            <div>
              <dt>Paths · points</dt>
              <dd className="mono">{stats ? `${fmt(stats.paths)} · ${fmt(stats.points)}` : "–"}</dd>
            </div>
            <div>
              <dt>Arena reserved</dt>
              <dd className="mono">{stats ? `${(stats.arenaBytes / (1 << 20)).toFixed(1)} MB` : "–"}</dd>
            </div>
          </dl>
          <p>Slice time is measured in the worker from the request to the last batch; the first layer reaches the page long before the last one is finished.</p>
        </li>
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ measured */

export function Measured({ wasmBytes, mesh, modelLabel, runBench }: { wasmBytes: number; mesh: Mesh | null; modelLabel: string; runBench(): Promise<BenchResult> }) {
  const [live, setLive] = useState<{ label: string; r: BenchResult } | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const maxTs = Math.max(...BENCH.rows.map((r) => r.tsMs), live?.r.tsMs ?? 0);

  const run = async () => {
    setRunning(true);
    setErr(null);
    try {
      setLive({ label: modelLabel, r: await runBench() });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const row = (key: string, label: string, tris: number, layers: number, ts: number, wa: number, full: number | null, mine = false) => (
    <tr key={key} className={mine ? "mine" : ""}>
      <th scope="row">{label}</th>
      <td className="mono">{fmt(tris)}</td>
      <td className="mono">{layers}</td>
      <td className="bars">
        <span className="b ts" style={{ width: `${(ts / maxTs) * 100}%` }} />
        <span className="b wa" style={{ width: `${(wa / maxTs) * 100}%` }} />
      </td>
      <td className="mono">{ms(ts)}</td>
      <td className="mono">{ms(wa)}</td>
      <td className="mono hl">{wa > 0 ? `${(ts / wa).toFixed(1)}×` : "–"}</td>
      <td className="mono">{wa > 0 ? fmt(tris / wa / 1000, 2) : "–"}</td>
      <td className="mono">{(wa / layers).toFixed(3)}</td>
      <td className="mono">{full !== null ? ms(full) : "–"}</td>
    </tr>
  );

  return (
    <section className="section" id="numbers" aria-labelledby="numbers-title">
      <p className="eyebrow">Measured</p>
      <h2 id="numbers-title">Numbers, not adjectives</h2>
      <dl className="proof">
        <div>
          <dt className="mono">{kb(wasmBytes || BENCH.wasmBytes)}</dt>
          <dd>WebAssembly core: freestanding C++17, no Emscripten, no libc</dd>
        </div>
        <div>
          <dt className="mono">{MEDIAN_SPEEDUP.toFixed(1)}×</dt>
          <dd>median speed-up over the same algorithm in idiomatic TypeScript (intersect + stitch, models over 1,000 triangles)</dd>
        </div>
        <div>
          <dt className="mono">{ms(GEAR.fullMs)}</dt>
          <dd>
            full slice of the {fmt(GEAR.triangles)}-triangle gear, mesh to ordered toolpaths ({GEAR.layers} layers)
          </dd>
        </div>
        <div>
          <dt className="mono">{TESTS.native + TESTS.node}</dt>
          <dd>
            tests: {TESTS.native} native C++ ({TESTS.checks} checks, ASan + UBSan) and {TESTS.node} Node; WASM output is bit-identical to native
          </dd>
        </div>
      </dl>

      <div className="bench">
        <div className="bench-head">
          <div>
            <h3>WASM vs TypeScript: triangle-plane intersection and stitching</h3>
            <p className="muted">
              Same algorithm, same tie-breaking, checked to give the same loops. The TypeScript reference uses idiomatic structures (a Map keyed by
              strings, objects per segment); the C++ uses integer points, an open-addressing hash and arena memory. Each sample repeats the stage for at least 10 ms; median of 5 to 9 samples at{" "}
              {BENCH.layerHeight} mm layers; {BENCH.runtime}, {BENCH.cpu}, {BENCH.measuredAt}.
            </p>
          </div>
          <div className="bench-run">
            <button className="secondary" onClick={run} disabled={running || !mesh}>
              {running ? "Running…" : `Run on this device (${modelLabel.toLowerCase()})`}
            </button>
            {err && <span className="error">{err}</span>}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Triangles</th>
                <th scope="col">Layers</th>
                <th scope="col" className="bars-h">
                  <span className="key ts" /> TS <span className="key wa" /> WASM
                </th>
                <th scope="col">TS</th>
                <th scope="col">WASM</th>
                <th scope="col">Speed-up</th>
                <th scope="col" title="Input triangles per second through the contour stage">
                  Mtri/s
                </th>
                <th scope="col">ms/layer</th>
                <th scope="col">Full slice</th>
              </tr>
            </thead>
            <tbody>
              {BENCH.rows.map((r) => row(r.id, r.label, r.triangles, r.layers, r.tsMs, r.wasmMs, r.fullMs))}
              {live && row("live", `${live.label} · this device`, live.r.triangles, live.r.layers, live.r.tsMs, live.r.wasmMs, null, true)}
            </tbody>
          </table>
        </div>
        <p className="note muted">
          Full slice = every stage in WebAssembly with default settings (2 walls, 20% infill, 4 top and 3 bottom solid layers). Mtri/s = input triangles ÷ WASM
          contour time, so a model whose triangles span many layers (the gear's flanks) scores lower than its per-layer work suggests.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ architecture */

const STACK = [
  "C++17, freestanding",
  "clang 18 → wasm32, wasm-ld",
  "g++ 13, ASan + UBSan",
  "TypeScript",
  "Web Workers",
  "React 19",
  "Three.js + React Three Fiber",
  "GLSL (instanced extrusion shader)",
  "Vite",
  "node:test",
  "Playwright",
];

const LIMITS = [
  "No supports, bridging detection, ironing or arc moves.",
  "No gap fill or thin-wall handling: features thinner than about two line widths lose their inner walls or vanish, and infill regions narrower than one line width stay empty.",
  "Offsetting is miter-and-resolve on a 1 µm integer grid; the boolean handles self-intersections and coincident edges, but crossings are rounded to the grid rather than snap-rounded, so a pathological input can still produce a sliver.",
  "Walls reused from the layer below when outlines match within 27 µm; time estimates ignore heating and firmware quirks.",
];

export function Architecture({ wasmBytes }: { wasmBytes: number }) {
  return (
    <section className="section" id="architecture" aria-labelledby="arch-title">
      <p className="eyebrow">Architecture</p>
      <h2 id="arch-title">Four layers with narrow interfaces</h2>
      <div className="arch">
        <ol className="tiers">
          <li>
            <div className="tier-head">
              <span className="n mono">UI</span>
              <h3>Main thread</h3>
            </div>
            <p>React panels and a React Three Fiber scene. Toolpaths draw as one instanced mesh: 32 bytes per segment, a GLSL vertex shader builds each bead, and scrubbing only changes the instance count.</p>
            <a className="file mono" href={src("src/viewer")} target="_blank" rel="noopener">
              src/App.tsx · src/viewer/
            </a>
          </li>
          <li className="wire">
            <span className="mono">postMessage: mesh in; layer batches out as transferred typed arrays</span>
          </li>
          <li>
            <div className="tier-head">
              <span className="n mono">W</span>
              <h3>Web Worker</h3>
            </div>
            <p>A typed message protocol. Batches adapt to about 12 ms of work so layers stream at a steady rate, and a newer request cancels an older slice between batches. G-code and the print-time estimate are generated here.</p>
            <a className="file mono" href={src("src/worker")} target="_blank" rel="noopener">
              src/worker/ · src/gcode/gcode.ts
            </a>
          </li>
          <li className="wire">
            <span className="mono">C ABI: 11 functions, struct layouts checked at load</span>
          </li>
          <li>
            <div className="tier-head">
              <span className="n mono">TS</span>
              <h3>Typed wrapper</h3>
            </div>
            <p>Instantiates the module (streaming compile), writes parameters into a 64-byte struct and decodes the little-endian batch format into flat typed arrays.</p>
            <a className="file mono" href={src("src/core/layerline.ts")} target="_blank" rel="noopener">
              src/core/layerline.ts · abi.ts
            </a>
          </li>
          <li className="wire">
            <span className="mono">linear memory: f32 triangles in; LLB1 batch out</span>
          </li>
          <li className="core">
            <div className="tier-head">
              <span className="n mono">C++</span>
              <h3>Geometry core · {kb(wasmBytes || BENCH.wasmBytes)}</h3>
            </div>
            <p>
              Built with <code>-nostdlib</code>: its own arena allocator over <code>memory.grow</code>, containers, introsort and hash map. Integer geometry with exact
              64-bit orientation tests. The same sources compile natively with g++ for the tests, and both builds hash to the same bytes.
            </p>
            <a className="file mono" href={src("core/src")} target="_blank" rel="noopener">
              core/src/ · Makefile
            </a>
          </li>
        </ol>
        <div className="arch-side">
          <h3 className="label">Why freestanding C++</h3>
          <p>
            Emscripten would add a libc, a JS loader and a larger binary for features this core never needs. Without them the module is {kb(wasmBytes || BENCH.wasmBytes)},
            starts with no runtime initialisation, imports one function (a clock) and behaves identically to the native test build.
          </p>
          <h3 className="label">Stack</h3>
          <ul className="chips">
            {STACK.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <h3 className="label">Known limits</h3>
          <ul className="limits">
            {LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
