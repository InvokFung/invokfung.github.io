// The benchmark report (written by `npm run bench`) and small formatting helpers.
// Every measured number on the page is read from `bench`.

import bench from "./data/bench.json";

export { bench };
export type Bench = typeof bench;

export const SOURCE_URL = "https://github.com/InvokFung/invokfung.github.io/tree/main/relay-src";

export const fmtUs = (us: number) => (us >= 1000 ? `${(us / 1000).toFixed(us >= 10_000 ? 0 : 2)} ms` : `${us < 10 ? us.toFixed(1) : Math.round(us)} µs`);

export const fmtMs = (ms: number | null | undefined) => {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "–";
  return ms >= 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
};

export const fmtUsd = (usd: number) => {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
};

export const fmtPct = (x: number | null | undefined, digits = 1) => (x === null || x === undefined ? "–" : `${(x * 100).toFixed(digits)}%`);

/** Bench percentages are already 0–100. */
export const pct = (x: number) => `${x}%`;

export const shortUp = (id: string) => id.replace("claude-", "");

export const PLACEHOLDER_RE = /<(?:EMAIL|PHONE|CARD|IBAN|NAME)_\d+>/g;
