import type { BotLevel } from "@arena/engine";

/** Player colours by seat; card art uses its own palette so the two never compete. */
export const SEAT_COLORS = ["#818cf8", "#22d3ee", "#fbbf24", "#f472b6"] as const;
export const seatColor = (seat: number) => SEAT_COLORS[seat % SEAT_COLORS.length] as string;

export const BOT_LABEL: Record<BotLevel, string> = { rookie: "Rookie", adept: "Adept", ace: "Ace" };

export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[1]?.[0] ?? "") : "")).toUpperCase();
}

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? "th");
}

/** Best grid for n cards (aspect 4:5) in a w x h box: the original "adaptive layout", generalised. */
export function fitGrid(n: number, w: number, h: number, gap: number, maxCard = 116): { columns: number; card: number } {
  let best = { columns: Math.max(1, Math.ceil(Math.sqrt(n))), card: 0 };
  for (let columns = 1; columns <= n; columns++) {
    const rows = Math.ceil(n / columns);
    const byWidth = (w - gap * (columns - 1)) / columns;
    const byHeight = ((h - gap * (rows - 1)) / rows) * 0.8;
    const card = Math.min(maxCard, byWidth, byHeight);
    if (card > best.card + 0.5) best = { columns, card };
  }
  return { columns: best.columns, card: Math.floor(best.card) };
}

/** Largest board (multiple of 3, 6..36) whose cards stay at least `minCard` px wide on this screen. */
export function screenCardLimit(viewW: number, viewH: number, minCard = 46): number {
  const w = Math.min(viewW - 32, 880);
  const h = Math.max(240, viewH - (viewW < 760 ? 250 : 190));
  let limit = 6;
  for (let n = 6; n <= 36; n += 3) if (fitGrid(n, w, h, 8).card >= minCard) limit = n;
  return limit;
}
