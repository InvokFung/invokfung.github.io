// Messages between the UI thread and the slicing worker.
import type { Batch, SliceParams, Stats } from "../core/abi";
import type { Estimate, PrinterProfile } from "../gcode/gcode";

export interface BenchResult {
  triangles: number;
  layers: number;
  loops: number;
  runs: number;
  tsMs: number;
  wasmMs: number;
}

export type ToWorker =
  | {
      type: "slice";
      id: number;
      positions: Float32Array;
      params: SliceParams;
      profile: PrinterProfile;
      modelName: string;
    }
  | { type: "gcode"; id: number }
  | { type: "bench"; id: number; positions: Float32Array; layerHeight: number; runs: number };

export type FromWorker =
  | { type: "ready"; wasmBytes: number }
  | { type: "start"; id: number; layers: number }
  | { type: "batch"; id: number; batch: Batch; ms: number }
  | { type: "done"; id: number; stats: Stats; estimate: Estimate; ms: number }
  | { type: "gcode"; id: number; bytes: ArrayBuffer }
  | { type: "bench"; id: number; result: BenchResult }
  | { type: "error"; id: number; message: string };
