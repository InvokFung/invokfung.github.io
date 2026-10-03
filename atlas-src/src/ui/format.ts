export const fmt = (n: number) => n.toLocaleString("en-US");

/** A duration in milliseconds, in µs below 0.1 ms. */
export const ms = (x: number) => (x < 0.1 ? `${Math.max(1, Math.round(x * 1000))} µs` : `${x.toFixed(x < 10 ? 2 : 1)} ms`);

export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}
