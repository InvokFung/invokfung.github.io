// Number and time formatting shared by every view. Fixed locale, so numbers read the same everywhere.

const INT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export const int = (n: number) => INT.format(Math.round(n));

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export function ms(x: number): string {
  if (x >= 1000) return `${(x / 1000).toFixed(2)} s`;
  if (x >= 100) return `${Math.round(x)} ms`;
  return `${x.toFixed(x < 1 ? 2 : 1)} ms`;
}

/** Minutes since midnight as 24-hour clock time. */
export function hhmm(min: number): string {
  const m = Math.floor(min + 1e-9);
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${int(n)} ${n === 1 ? one : many}`;
