// Typed wrapper around the wasm module. Works in a browser worker and in node.
import { decodeBatch, PARAM_LAYOUT, PARAMS_BYTES, STAT_NAMES, type Batch, type SliceParams, type Stats } from "./abi";

export const ABI_VERSION = 1;

interface Exports {
  memory: WebAssembly.Memory;
  ll_abi_version(): number;
  ll_params(): number;
  ll_params_size(): number;
  ll_params_reset(): void;
  ll_input(triangles: number): number;
  ll_begin(tris: number, triangles: number): number;
  ll_advance(maxLayers: number): number;
  ll_batch_size(): number;
  ll_stats(): number;
  ll_stats_count(): number;
  ll_bench_contours(tris: number, triangles: number, layerMm: number): number;
}

export interface ContourBenchResult {
  layers: number;
  segments: number;
  loops: number;
  points: number;
  ms: number;
}

/** An in-progress slice: call `next` until it returns null. */
export interface SliceJob {
  layers: number;
  /** The next batch of finished layers, or null when every layer is out. */
  next(maxLayers: number): Batch | null;
  /** Same as `next`, as the raw bytes of the batch (used by the parity test). */
  nextRaw(maxLayers: number): ArrayBuffer | null;
  stats(): Stats;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export class LayerlineCore {
  private constructor(
    private readonly x: Exports,
    readonly wasmBytes: number,
  ) {
    if (x.ll_abi_version() !== ABI_VERSION) throw new Error(`layerline: ABI ${x.ll_abi_version()}, expected ${ABI_VERSION}`);
    if (x.ll_params_size() !== PARAMS_BYTES) throw new Error("layerline: SliceParams layout mismatch");
    if (x.ll_stats_count() !== STAT_NAMES.length) throw new Error("layerline: Stats layout mismatch");
  }

  /** From raw bytes (node, tests) or a fetch Response (browser, streaming compile). */
  static async load(source: BufferSource | Response | Promise<Response>): Promise<LayerlineCore> {
    const imports = { env: { now_ms: now } };
    const src = await source;
    if (src instanceof Response) {
      const len = Number(src.headers.get("content-length")) || 0;
      try {
        const { instance } = await WebAssembly.instantiateStreaming(src.clone(), imports);
        return new LayerlineCore(instance.exports as unknown as Exports, len);
      } catch {
        // Servers that send the wrong MIME type: compile from bytes instead.
        const bytes = await src.arrayBuffer();
        const { instance } = await WebAssembly.instantiate(bytes, imports);
        return new LayerlineCore(instance.exports as unknown as Exports, bytes.byteLength);
      }
    }
    const { instance } = await WebAssembly.instantiate(src, imports);
    return new LayerlineCore(instance.exports as unknown as Exports, src.byteLength);
  }

  /** Bytes of linear memory currently reserved by the module. */
  get memoryBytes() {
    return this.x.memory.buffer.byteLength;
  }

  /** The defaults compiled into the core (default_params()). */
  defaults(): SliceParams {
    this.x.ll_params_reset();
    const dv = new DataView(this.x.memory.buffer, this.x.ll_params(), PARAMS_BYTES);
    const out = {} as SliceParams;
    PARAM_LAYOUT.forEach(([k, t], i) => (out[k] = t === "f32" ? dv.getFloat32(i * 4, true) : dv.getUint32(i * 4, true)));
    return out;
  }

  private writeParams(p: SliceParams) {
    const dv = new DataView(this.x.memory.buffer, this.x.ll_params(), PARAMS_BYTES);
    PARAM_LAYOUT.forEach(([k, t], i) => {
      if (t === "f32") dv.setFloat32(i * 4, p[k], true);
      else dv.setUint32(i * 4, Math.max(0, Math.round(p[k])), true);
    });
  }

  private writeInput(positions: Float32Array): number {
    const n = positions.length / 9;
    const ptr = this.x.ll_input(n);
    // Views are created after the call: growing memory detaches older buffers.
    new Float32Array(this.x.memory.buffer, ptr, positions.length).set(positions);
    return ptr;
  }

  slice(positions: Float32Array, params: SliceParams): SliceJob {
    const x = this.x;
    const ptr = this.writeInput(positions);
    this.writeParams(params);
    const layers = x.ll_begin(ptr, positions.length / 9);
    const nextRaw = (maxLayers: number) => {
      const at = x.ll_advance(maxLayers);
      return at ? x.memory.buffer.slice(at, at + x.ll_batch_size()) : null;
    };
    return {
      layers,
      nextRaw,
      next(maxLayers: number) {
        const raw = nextRaw(maxLayers);
        return raw ? decodeBatch(raw) : null;
      },
      stats() {
        const v = new Float64Array(x.memory.buffer, x.ll_stats(), STAT_NAMES.length);
        return Object.fromEntries(STAT_NAMES.map((n, i) => [n, v[i]])) as Stats;
      },
    };
  }

  /**
   * Intersection + stitching only; the input copy is outside the timed region.
   * With `minMs`, the stage repeats until that much time has passed and the
   * mean is returned, so tiny meshes are not lost in the timer's resolution.
   */
  benchContours(positions: Float32Array, layerHeight: number, minMs = 0): ContourBenchResult {
    const ptr = this.writeInput(positions);
    const n = positions.length / 9;
    let runs = 0,
      at = 0,
      ms = 0;
    const t0 = now();
    do {
      at = this.x.ll_bench_contours(ptr, n, layerHeight);
      runs++;
      ms = now() - t0;
    } while (ms < minMs);
    const r = new Uint32Array(this.x.memory.buffer, at, 4);
    return { layers: r[0], segments: r[1], loops: r[2], points: r[3], ms: ms / runs };
  }

}
