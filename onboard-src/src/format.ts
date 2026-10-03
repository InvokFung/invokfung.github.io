// Number formatting shared by every view. Fixed locale, so numbers read the same everywhere.

const INT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export const int = (n: number) => INT.format(Math.round(n));

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export const f3 = (x: number) => x.toFixed(3);

export function ms(x: number): string {
  if (x >= 10_000) return `${(x / 1000).toFixed(1)} s`;
  if (x >= 1000) return `${(x / 1000).toFixed(2)} s`;
  if (x >= 10) return `${Math.round(x)} ms`;
  return `${x.toFixed(1)} ms`;
}

export function bytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Probability with enough decimals to tell 0.999 from 0.99999. */
export function prob(p: number): string {
  if (p >= 0.9999995) return "1.000000";
  if (p >= 0.999) return p.toFixed(6);
  if (p >= 0.99) return p.toFixed(4);
  return p.toFixed(3);
}

export const bits = (w: number) => `${w >= 0 ? "+" : "−"}${Math.abs(w).toFixed(1)}`;

export const plural = (n: number, one: string, many = `${one}s`) => `${int(n)} ${n === 1 ? one : many}`;
