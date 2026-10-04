export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** Compact counts: 1.2k, 3.4M. */
export function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`;
  return fmt(n);
}

/** A duration in ms. */
export function ms(x: number): string {
  if (!Number.isFinite(x)) return "–";
  if (x === 0) return "0";
  if (x >= 10_000) return `${(x / 1000).toFixed(1)} s`;
  if (x >= 1000) return `${(x / 1000).toFixed(2)} s`;
  if (x >= 100) return `${Math.round(x)} ms`;
  if (x >= 10) return `${x.toFixed(1)} ms`;
  if (x >= 0.1) return `${x.toFixed(2)} ms`;
  return `${Math.max(1, Math.round(x * 1000))} µs`;
}

/** A duration in ms as a bare number, for a column whose header carries the unit. */
export function msNum(x: number): string {
  if (!Number.isFinite(x)) return "–";
  if (x === 0) return "0";
  if (x >= 100) return fmt(x);
  if (x >= 10) return x.toFixed(1);
  if (x >= 0.01) return x.toFixed(2);
  return "<0.01";
}

export const pct = (x: number, digits = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : "–");

/** Simulated ms since start to a wall-clock string, given the start hour. */
export function clock(simMs: number, startHour: number, seconds = false): string {
  const total = startHour * 3600 + simMs / 1000;
  const d = ((total % 86400) + 86400) % 86400;
  const h = Math.floor(d / 3600);
  const m = Math.floor((d % 3600) / 60);
  const s = Math.floor(d % 60);
  const p = (x: number) => String(x).padStart(2, "0");
  return seconds ? `${p(h)}:${p(m)}:${p(s)}` : `${p(h)}:${p(m)}`;
}

export const minutes = (x: number) => `${x.toFixed(1)} min`;

/** A fault's size in words. */
export function faultLabel(kind: string, magnitude: number): string {
  switch (kind) {
    case "latency":
      return `+${Math.round(magnitude)} ms latency`;
    case "errors":
      return `${pct(magnitude, 0)} errors`;
    case "capacity":
      return `${pct(magnitude, 0)} of workers lost`;
    case "timeout":
      return `${pct(magnitude, 0)} of calls hang`;
    case "deploy":
      return `bad deploy, ${magnitude.toFixed(1)}× slower`;
    default:
      return `${kind} ${magnitude}`;
  }
}

export const shortId = (id: string) => `${id.slice(0, 8)}…`;
