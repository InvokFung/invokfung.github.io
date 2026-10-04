export const fmt = (n: number, digits = 0) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Milliseconds with sensible precision. */
export const ms = (v: number) => (v >= 100 ? `${fmt(v)} ms` : v >= 10 ? `${v.toFixed(1)} ms` : `${v.toFixed(2)} ms`);

export const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

export const bytes = (b: number) => (b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : kb(b));

export const mm = (v: number, digits = 1) => `${v.toFixed(digits)}`;

/** Metres from millimetres. */
export const metres = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} m` : `${Math.round(v)} mm`);

export function duration(s: number) {
  if (!Number.isFinite(s)) return "–";
  if (s < 59.5) return `${Math.max(1, Math.round(s))} s`;
  const total = Math.round(s / 60),
    h = Math.floor(total / 60),
    m = total % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}
