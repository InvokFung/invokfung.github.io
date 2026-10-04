// The slicing worker: owns the wasm module, streams finished layers to the UI
// thread in small batches, keeps its own copy of the toolpaths for G-code, and
// runs the WASM vs TypeScript benchmark on request.
import wasmUrl from "../wasm/layerline.wasm?url";
import { batchTransferables, type SliceParams } from "../core/abi";
import { LayerlineCore } from "../core/layerline";
import { sliceContoursTS } from "../core/reference";
import { Toolpaths } from "../core/toolpaths";
import { generateGcode, type PrinterProfile } from "../gcode/gcode";
import type { FromWorker, ToWorker } from "./protocol";

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

const corePromise = LayerlineCore.load(fetch(wasmUrl));
corePromise.then(
  (c) => post({ type: "ready", wasmBytes: c.wasmBytes }),
  (e: Error) => post({ type: "error", id: -1, message: `Could not load the WebAssembly core: ${e.message}` }),
);

// A macrotask yield that is not clamped like nested setTimeout(0): lets new
// messages (a newer slice request) in between batches.
const channel = new MessageChannel();
const waiting: (() => void)[] = [];
channel.port1.onmessage = () => waiting.shift()?.();
const yieldToEvents = () =>
  new Promise<void>((r) => {
    waiting.push(r);
    channel.port2.postMessage(0);
  });

let current = 0; // id of the newest slice request; older loops stop
// Slices and benchmarks share the module's input buffer, so they take turns:
// each task runs after the previous one has returned. A superseded slice
// returns at its next yield, so a newer request waits at most one batch.
let queue: Promise<unknown> = Promise.resolve();
const exclusive = (task: () => Promise<void>) => {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
};
let last: { tp: Toolpaths; params: SliceParams; profile: PrinterProfile; modelName: string; triangles: number } | null = null;

async function slice(m: Extract<ToWorker, { type: "slice" }>) {
  const core = await corePromise;
  if (m.id !== current) return; // a newer request arrived while this one waited
  const t0 = performance.now();
  const job = core.slice(m.positions, m.params);
  const tp = new Toolpaths(job.layers);
  post({ type: "start", id: m.id, layers: job.layers });
  // Batch size adapts so each batch takes about 12 ms: the UI gets a steady
  // stream of layers without paying a message per layer on small models.
  let want = 2;
  for (;;) {
    const tb = performance.now();
    const batch = job.next(want);
    if (!batch) break;
    const ms = performance.now() - tb;
    tp.append(batch);
    post({ type: "batch", id: m.id, batch, ms }, batchTransferables(batch));
    want = Math.max(1, Math.min(64, Math.round(want * Math.min(2, Math.max(0.5, 12 / Math.max(ms, 0.5))))));
    await yieldToEvents();
    if (m.id !== current) return; // superseded by a newer request
  }
  const ms = performance.now() - t0;
  const { estimate } = generateGcode(tp, m.params, m.profile, { emit: false });
  last = { tp, params: m.params, profile: m.profile, modelName: m.modelName, triangles: m.positions.length / 9 };
  post({ type: "done", id: m.id, stats: job.stats(), estimate, ms });
}

async function bench(m: Extract<ToWorker, { type: "bench" }>) {
  const core = await corePromise;
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const ts: number[] = [],
    wa: number[] = [];
  let layers = 0,
    loops = 0;
  for (let r = 0; r < m.runs + 1; r++) {
    // Each sample repeats its stage for at least 25 ms: browsers coarsen
    // performance.now(), which would round a small mesh's time to zero.
    let n = 0,
      t = 0,
      ref: ReturnType<typeof sliceContoursTS>;
    const t0 = performance.now();
    do {
      ref = sliceContoursTS(m.positions, m.layerHeight);
      n++;
      t = performance.now() - t0;
    } while (t < 25);
    const w = core.benchContours(m.positions, m.layerHeight, 25);
    if (ref.loops !== w.loops || ref.points !== w.points) throw new Error("benchmark: TypeScript and WASM disagree");
    layers = w.layers;
    loops = w.loops;
    if (r > 0) {
      // the first round is a warm-up
      ts.push(t / n);
      wa.push(w.ms);
    }
    await yieldToEvents();
  }
  post({ type: "bench", id: m.id, result: { triangles: m.positions.length / 9, layers, loops, runs: m.runs, tsMs: median(ts), wasmMs: median(wa) } });
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  const fail = (err: unknown) => post({ type: "error", id: m.id, message: err instanceof Error ? err.message : String(err) });
  try {
    if (m.type === "slice") {
      current = m.id;
      exclusive(() => slice(m)).catch(fail);
    } else if (m.type === "bench") exclusive(() => bench(m)).catch(fail);
    else if (m.type === "gcode") {
      if (!last) throw new Error("Nothing sliced yet");
      const { text } = generateGcode(last.tp, last.params, last.profile, { emit: true, modelName: last.modelName, triangles: last.triangles });
      const bytes = new TextEncoder().encode(text!).buffer as ArrayBuffer;
      post({ type: "gcode", id: m.id, bytes }, [bytes]);
    }
  } catch (err) {
    fail(err);
  }
};
