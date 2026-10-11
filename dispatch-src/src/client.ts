// The page's side of the worker (request/response by id) and the simulated
// clock. React reads both through useSyncExternalStore; the map reads them
// every frame without re-rendering.

import { useSyncExternalStore } from "react";
import type { Skill } from "./core/day";
import type { InitData, Request, Response, Snapshot, UserEvent } from "./worker/protocol";

export const DAY_FROM = 7 * 60;
export const DAY_TO = 19 * 60 + 45;
export const START_AT = 8 * 60 + 30;
export const SPEEDS = [2, 6, 15] as const;

export interface ClientState {
  phase: "loading" | "ready" | "error";
  error: string | null;
  init: InitData | null;
  snap: Snapshot | null;
  busy: boolean;
  /** Message for the last action that failed (for example an overrun with no job under way). */
  notice: string | null;
  selectedTech: number | null;
  selectedJob: number | null;
  /** Index of the log entry whose moved jobs are lit on the map and timeline. */
  lit: number | null;
  litAt: number;
  urgentSkill: Skill;
  scripted: boolean;
}

class Client {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private listeners = new Set<() => void>();
  state: ClientState = { phase: "loading", error: null, init: null, snap: null, busy: false, notice: null, selectedTech: null, selectedJob: null, lit: null, litAt: 0, urgentSkill: 0, scripted: true };

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL("./worker/dispatch.worker.ts", import.meta.url), { type: "module", name: "dispatch" });
    w.onmessage = (e: MessageEvent<Response>) => {
      const m = e.data;
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.ok) p.resolve(m.data);
      else p.reject(new Error(m.error));
    };
    w.onerror = (e) => this.set({ phase: "error", error: e.message || "the worker failed to start" });
    this.worker = w;
    return w;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;

  set(patch: Partial<ClientState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private call<T>(req: Request): Promise<T> {
    const w = this.ensure();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      w.postMessage({ id, req });
    });
  }

  async start() {
    if (this.state.init || this.started) return;
    this.started = true;
    try {
      const init = await this.call<InitData>({ type: "init" });
      this.set({ phase: "ready", init, snap: init.snap });
      clock.t = START_AT;
      clock.playing = !matchMedia("(prefers-reduced-motion: reduce)").matches;
      clock.emit();
    } catch (e) {
      this.set({ phase: "error", error: (e as Error).message });
    }
  }
  private started = false;

  private async run(req: Request, light = true) {
    this.set({ busy: true, notice: null });
    try {
      const prevLog = this.state.snap?.log.length ?? 0;
      const snap = await this.call<Snapshot>(req);
      const patch: Partial<ClientState> = { snap, busy: false };
      if (light && snap.log.length > prevLog) {
        patch.lit = snap.log.length - 1;
        patch.litAt = performance.now();
      }
      this.set(patch);
    } catch (e) {
      this.set({ busy: false, notice: (e as Error).message });
    }
  }

  advance(to: number) {
    return this.run({ type: "advance", to });
  }

  event(event: UserEvent) {
    if (this.state.phase !== "ready") return;
    const at = Math.max(clock.t, this.state.snap?.now ?? 0);
    return this.run({ type: "event", at: Math.round(at * 10) / 10, event });
  }

  async reset(scripted = this.state.scripted) {
    this.set({ scripted, lit: null, selectedJob: null, selectedTech: null });
    clock.t = START_AT;
    clock.emit();
    await this.run({ type: "reset", scripted }, false);
    clock.playing = true;
    clock.emit();
  }
}

export const client = new Client();

export function useClient(): ClientState {
  return useSyncExternalStore(client.subscribe, client.getState, client.getState);
}

// ---------------------------------------------------------------- clock

class Clock {
  t = START_AT;
  playing = false;
  speed: number = SPEEDS[1];
  private listeners = new Set<() => void>();
  private shown = { minute: -1, playing: false, speed: 0 };
  private last = 0;
  private raf = 0;
  snapshot = { t: START_AT, playing: false, speed: SPEEDS[1] as number };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  emit() {
    this.snapshot = { t: this.t, playing: this.playing, speed: this.speed };
    this.shown = { minute: Math.floor(this.t), playing: this.playing, speed: this.speed };
    for (const l of this.listeners) l();
  }

  private frame = (now: number) => {
    const dt = this.last ? Math.min(100, now - this.last) : 0;
    this.last = now;
    const st = client.state;
    if (this.playing && st.phase === "ready") {
      this.t = Math.min(DAY_TO, this.t + (dt / 1000) * this.speed);
      if (this.t >= DAY_TO) this.playing = false;
      const next = st.snap?.nextAuto;
      if (next !== null && next !== undefined && this.t >= next && !st.busy) {
        this.t = Math.max(this.t, next);
        void client.advance(next);
      }
    }
    if (Math.floor(this.t) !== this.shown.minute || this.playing !== this.shown.playing || this.speed !== this.shown.speed) this.emit();
    this.raf = requestAnimationFrame(this.frame);
  };

  toggle() {
    if (this.t >= DAY_TO) return;
    this.playing = !this.playing;
    this.emit();
  }

  setSpeed(s: number) {
    this.speed = s;
    this.emit();
  }
}

export const clock = new Clock();

/** The clock, refreshed once per simulated minute. */
export function useClock() {
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
}
