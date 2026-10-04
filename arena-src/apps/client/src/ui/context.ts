import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { ArenaClient, ClientState } from "../state/client";

export const ClientContext = createContext<ArenaClient | null>(null);

export function useClient(): ArenaClient {
  const c = useContext(ClientContext);
  if (!c) throw new Error("ArenaClient missing");
  return c;
}

export function useArena(): ClientState {
  const c = useClient();
  return useSyncExternalStore(c.subscribe, c.getState);
}

/** Re-render on every animation frame while `active` (timers, replay playback). */
export function useFrame(active: boolean): number {
  const [t, setT] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      setT(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return t;
}

/** Re-render every `ms`. */
export function useTicker(ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

export function useHash(): string {
  return useSyncExternalStore(
    (fn) => {
      window.addEventListener("hashchange", fn);
      return () => window.removeEventListener("hashchange", fn);
    },
    () => location.hash,
  );
}

export function go(hash: string): void {
  if (location.hash !== hash) location.hash = hash;
}

export function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      const mq = matchMedia(q);
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    },
    () => matchMedia(q).matches,
  );
}
