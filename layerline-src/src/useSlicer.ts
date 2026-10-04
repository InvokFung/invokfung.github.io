// The UI thread's side of the worker protocol: one worker for the page's
// lifetime, slices stream into a PreviewStore, and G-code and benchmarks are
// request/response.
import { useCallback, useEffect, useRef, useState } from "react";
import type { SliceParams, Stats } from "./core/abi";
import { DEFAULT_PROFILE, type Estimate } from "./gcode/gcode";
import type { Mesh } from "./mesh/mesh";
import { PreviewStore } from "./viewer/store";
import type { BenchResult, FromWorker, ToWorker } from "./worker/protocol";

export interface SliceState {
  /** the WebAssembly module has been compiled in the worker */
  ready: boolean;
  wasmBytes: number;
  streaming: boolean;
  store: PreviewStore | null;
  /** layers received so far */
  received: number;
  total: number;
  stats: Stats | null;
  estimate: Estimate | null;
  /** worker time from the request to the last batch (the estimate runs after) */
  ms: number;
  /** from the request to the first layer on screen */
  firstLayerMs: number;
  /** what the finished slice was made from */
  params: SliceParams | null;
  error: string | null;
}

const initial: SliceState = {
  ready: false,
  wasmBytes: 0,
  streaming: false,
  store: null,
  received: 0,
  total: 0,
  stats: null,
  estimate: null,
  ms: 0,
  firstLayerMs: 0,
  params: null,
  error: null,
};

export function useSlicer(onStart?: (total: number) => void) {
  const [state, setState] = useState(initial);
  const worker = useRef<Worker | null>(null);
  const nextId = useRef(1);
  const sliceId = useRef(0);
  const sent = useRef({ t0: 0, params: null as SliceParams | null });
  const waiting = useRef(new Map<number, { resolve(m: FromWorker): void; reject(e: Error): void }>());
  const startCb = useRef(onStart);
  startCb.current = onStart;

  useEffect(() => {
    const w = new Worker(new URL("./worker/slicer.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    let store: PreviewStore | null = null;
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      switch (m.type) {
        case "ready":
          setState((s) => ({ ...s, ready: true, wasmBytes: m.wasmBytes }));
          return;
        case "start":
          if (m.id !== sliceId.current) return;
          store = new PreviewStore(m.layers);
          startCb.current?.(m.layers);
          setState((s) => ({ ...s, store, received: 0, total: m.layers, stats: null, estimate: null, error: null }));
          return;
        case "batch": {
          if (m.id !== sliceId.current || !store) return;
          const first = store.layers === 0;
          store.append(m.batch);
          const received = store.layers;
          const firstLayerMs = performance.now() - sent.current.t0;
          setState((s) => ({ ...s, received, ...(first ? { firstLayerMs } : {}) }));
          return;
        }
        case "done":
          if (m.id !== sliceId.current) return;
          setState((s) => ({ ...s, streaming: false, stats: m.stats, estimate: m.estimate, ms: m.ms, params: sent.current.params }));
          return;
        case "error":
          if (waiting.current.has(m.id)) {
            waiting.current.get(m.id)!.reject(new Error(m.message));
            waiting.current.delete(m.id);
          } else if (m.id === sliceId.current || m.id === -1) setState((s) => ({ ...s, streaming: false, error: m.message }));
          return;
        default: {
          const p = waiting.current.get(m.id);
          if (p) {
            waiting.current.delete(m.id);
            p.resolve(m);
          }
        }
      }
    };
    w.onerror = (e) => setState((s) => ({ ...s, streaming: false, error: e.message || "The slicing worker failed to start" }));
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);

  const post = (m: ToWorker) => worker.current?.postMessage(m);

  const slice = useCallback((mesh: Mesh, params: SliceParams) => {
    const id = nextId.current++;
    sliceId.current = id;
    sent.current = { t0: performance.now(), params };
    setState((s) => ({ ...s, streaming: true, error: null }));
    post({ type: "slice", id, positions: mesh.positions, params, profile: DEFAULT_PROFILE, modelName: mesh.name });
  }, []);

  const request = useCallback(<T extends FromWorker["type"]>(m: ToWorker, _expect: T) => {
    return new Promise<Extract<FromWorker, { type: T }>>((resolve, reject) => {
      waiting.current.set(m.id, { resolve: resolve as (m: FromWorker) => void, reject });
      post(m);
    });
  }, []);

  const gcode = useCallback(async () => {
    const r = await request({ type: "gcode", id: nextId.current++ }, "gcode");
    return r.bytes;
  }, [request]);

  const bench = useCallback(
    async (mesh: Mesh, layerHeight: number, runs = 5): Promise<BenchResult> => {
      const r = await request({ type: "bench", id: nextId.current++, positions: mesh.positions, layerHeight, runs }, "bench");
      return r.result;
    },
    [request],
  );

  return { state, slice, gcode, bench };
}
