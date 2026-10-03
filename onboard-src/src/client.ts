// The page's side of the worker: request/response by id, stage events into a
// small store that React reads with useSyncExternalStore.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { StageKey } from "./core/pipeline";
import type { SourceFile } from "./core/types";
import type { Overview, Request, Response, WorkerEvent } from "./worker/protocol";

export type Phase = "idle" | "generating" | "verifying" | "running" | "ready" | "error";

export interface StageState {
  ms: number;
  stats: Record<string, number>;
  /** performance.now() when the event arrived, for animation. */
  at: number;
}

export interface ClientState {
  phase: Phase;
  detail: string | null;
  /** Runs started, so views can tell a new dataset from an edit. */
  run: number;
  stages: Partial<Record<StageKey, StageState>>;
  startedAt: number;
  overview: Overview | null;
  /** Bumped after every change, so views refetch. */
  version: number;
  busy: boolean;
}

class Client {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private listeners = new Set<() => void>();
  state: ClientState = { phase: "idle", detail: null, run: 0, stages: {}, startedAt: 0, overview: null, version: 0, busy: false };

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL("./worker/pipeline.worker.ts", import.meta.url), { type: "module", name: "onboard-pipeline" });
    w.onmessage = (e: MessageEvent<Response | WorkerEvent>) => {
      const m = e.data;
      if ("event" in m) {
        if (m.event === "phase") this.set({ phase: m.phase, detail: m.detail ?? null });
        else this.set({ stages: { ...this.state.stages, [m.stage]: { ms: m.ms, stats: m.stats, at: performance.now() } } });
        return;
      }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.ok) p.resolve(m.data);
      else p.reject(new Error(m.error));
    };
    w.onerror = (e) => this.set({ phase: "error", detail: e.message || "the worker failed to start" });
    this.worker = w;
    return w;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  private set(patch: Partial<ClientState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  call<T>(req: Request): Promise<T> {
    const w = this.ensure();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      w.postMessage({ id, req });
    });
  }

  private async start(req: Request) {
    this.set({ stages: {}, overview: null, startedAt: performance.now(), run: this.state.run + 1, phase: "generating", detail: null });
    try {
      const overview = await this.call<Overview>(req);
      this.set({ overview, version: this.state.version + 1 });
    } catch (e) {
      this.set({ phase: "error", detail: (e as Error).message });
    }
  }

  runDemo() {
    return this.start({ type: "demo" });
  }

  runFiles(files: SourceFile[]) {
    return this.start({ type: "files", files });
  }

  /** A request that changes the session; returns the new overview and refreshes every view. */
  async mutate(req: Request): Promise<Overview | null> {
    this.set({ busy: true });
    try {
      const overview = await this.call<Overview>(req);
      this.set({ overview, version: this.state.version + 1, busy: false });
      return overview;
    } catch (e) {
      this.set({ busy: false });
      throw e;
    }
  }

  /** For requests that change state without returning an overview (PII policy). */
  async touch<T>(req: Request): Promise<T> {
    const out = await this.call<T>(req);
    this.set({ version: this.state.version + 1 });
    return out;
  }
}

export const client = new Client();

export function useClient(): ClientState {
  return useSyncExternalStore(client.subscribe, client.getState, client.getState);
}

/** Fetches a worker view and refetches it after every change. `req` null means "not yet". */
export function useView<T>(req: Request | null, deps: unknown[] = []): { data: T | null; error: string | null; loading: boolean } {
  const { version, phase } = useClient();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: false });
  const key = req ? JSON.stringify(req) : null;
  useEffect(() => {
    if (!key || phase !== "ready") return;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    client
      .call<T>(JSON.parse(key) as Request)
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e: Error) => live && setState({ data: null, error: e.message, loading: false }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, phase, ...deps]);
  return state;
}

export function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
