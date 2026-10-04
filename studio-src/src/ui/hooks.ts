import { useEffect, useRef, useState } from "react";

/** Calls fn on every animation frame while mounted, with seconds since the previous call. */
export function useAnimationFrame(fn: (dt: number, now: number) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let id = 0;
    let last = performance.now();
    const tick = (now: number) => {
      ref.current(Math.min(0.1, (now - last) / 1000), now);
      last = now;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
}

/** Sets textContent only when it changes, to avoid needless layout work at 60 fps. */
export function setText(el: Element | null, text: string) {
  if (el && el.textContent !== text) el.textContent = text;
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}
