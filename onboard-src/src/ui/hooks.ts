import { useEffect, useRef, useState } from "react";

export function useMedia(query: string): boolean {
  const get = () => typeof window !== "undefined" && window.matchMedia(query).matches;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

export const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)");

/** True while the element is on screen (and the tab is visible). */
export function useOnScreen<T extends Element>(ref: React.RefObject<T | null>, margin = "0px"): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return on;
}

/** Counts up from 0 to `value` over `ms` once `active`; jumps straight there with reduced motion. */
export function useTicker(value: number | null, active: boolean, ms = 700): number | null {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<number | null>(null);
  const from = useRef(0);
  useEffect(() => {
    if (value === null || !active) {
      setShown(null);
      from.current = 0;
      return;
    }
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - (1 - k) ** 3;
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, active, reduced, ms]);
  return shown;
}
