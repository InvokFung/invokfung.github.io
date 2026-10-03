import type { ReactElement } from "react";

/**
 * Twelve card faces: each value has its own shape *and* colour (and a corner numeral),
 * so triples stay distinguishable without relying on colour alone.
 */
const INK = ["#4f46e5", "#0891b2", "#d97706", "#e11d48", "#059669", "#9333ea", "#0284c7", "#ea580c", "#65a30d", "#db2777", "#0d9488", "#ca8a04"] as const;

const SHAPES: ReactElement[] = [
  <circle cx="20" cy="20" r="11" />,
  <path d="M20 7 33 31H7Z" />,
  <rect x="9" y="9" width="22" height="22" rx="3" />,
  <path d="M20 5 34 20 20 35 6 20Z" />,
  <path d="m20 6 12 7v14l-12 7-12-7V13Z" />,
  <path d="m20 5 4.2 9.6 10.4 1-7.9 6.9 2.4 10.2L20 27.4l-9.1 5.3 2.4-10.2-7.9-6.9 10.4-1Z" />,
  <path d="M16 6h8v10h10v8H24v10h-8V24H6v-8h10Z" />,
  <path fillRule="evenodd" d="M20 6a14 14 0 1 1 0 28 14 14 0 0 1 0-28Zm0 7a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z" />,
  <path d="M6 14 20 6l14 8v7L20 13 6 21Zm0 11 14-8 14 8v7l-14-8-14 8Z" />,
  <path d="M5 23c4-8 8-8 12 0s8 8 12 0c2-4 4-5 6-5v6c-2 0-3 2-5 5-4 7-10 7-14 0s-6-7-10 0Z" transform="translate(0 -4)" />,
  <path d="M8 8h6v24H8Zm9 6h6v18h-6Zm9-6h6v24h-6Z" />,
  <path d="M23 4 9 23h9l-3 13 16-21h-9Z" />,
];

export const VALUE_COUNT = SHAPES.length;
export const inkOf = (value: number) => INK[value % INK.length] as string;
const NAMES = ["Orb", "Peak", "Block", "Gem", "Hex", "Star", "Cross", "Ring", "Chevron", "Wave", "Bars", "Bolt"];
export const valueName = (value: number) => NAMES[value % NAMES.length] as string;

export function Glyph({ value, size = 40 }: { value: number; size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} fill={inkOf(value)} aria-hidden="true" className="glyph">
      {SHAPES[value % SHAPES.length]}
    </svg>
  );
}

/** The three-dot "triple" mark used on card backs and as the favicon. */
export function TripleMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={className}>
      <circle cx="12" cy="6" r="3.4" fill="#6366f1" />
      <circle cx="6" cy="16.5" r="3.4" fill="#06b6d4" />
      <circle cx="18" cy="16.5" r="3.4" fill="#f59e0b" />
    </svg>
  );
}
