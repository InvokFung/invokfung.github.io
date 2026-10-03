import type { Instrument } from "../dsp/theory";
import type { SafeStorage } from "./storage";

/** One finished drill. Notes are stored compactly as [midi, cents, drift, score]. */
export interface SessionRecord {
  id: string;
  /** Epoch milliseconds when the drill finished. */
  at: number;
  source: "mic" | "demo";
  instrument: Instrument;
  drillId: string;
  title: string;
  a4: number;
  notes: [number, number, number, number][];
  wrong: number;
  score: number;
  seconds: number;
}

const KEY = "intonation-studio:v1:sessions";
const MAX_SESSIONS = 400;

export function loadSessions(store: SafeStorage): SessionRecord[] {
  const list = store.read<unknown>(KEY, []);
  return Array.isArray(list) ? (list as SessionRecord[]).filter((s) => s && Array.isArray(s.notes) && typeof s.at === "number") : [];
}

export function saveSessions(store: SafeStorage, sessions: SessionRecord[]): boolean {
  return store.write(KEY, sessions.slice(-MAX_SESSIONS));
}

export function clearSessions(store: SafeStorage) {
  store.remove(KEY);
}

/** Local calendar day, e.g. "2026-10-03". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDay(key: string, by: number): string {
  const [y, m, d] = key.split("-").map(Number);
  // Noon avoids daylight-saving edges.
  return dayKey(new Date(y, m - 1, d + by, 12).getTime());
}

export interface Streak {
  /** Consecutive days with practice, ending today (or yesterday, if today is not done yet). */
  current: number;
  best: number;
  practisedToday: boolean;
}

export function computeStreak(times: number[], now: number): Streak {
  const days = new Set(times.map(dayKey));
  const today = dayKey(now);
  const practisedToday = days.has(today);
  let cursor = practisedToday ? today : shiftDay(today, -1);
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor = shiftDay(cursor, -1);
  }
  let best = 0;
  for (const day of days) {
    if (days.has(shiftDay(day, -1))) continue; // only count from the first day of each run
    let len = 0;
    for (let d = day; days.has(d); d = shiftDay(d, 1)) len++;
    best = Math.max(best, len);
  }
  return { current, best, practisedToday };
}

export interface NoteStat {
  midi: number;
  count: number;
  /** Mean signed deviation in cents (+ = sharp): the player's tendency on this note. */
  mean: number;
  /** Mean absolute deviation in cents. */
  meanAbs: number;
}

export function noteStats(sessions: SessionRecord[]): Map<number, NoteStat> {
  const acc = new Map<number, { n: number; s: number; a: number }>();
  for (const s of sessions)
    for (const [midi, c] of s.notes) {
      const e = acc.get(midi) ?? { n: 0, s: 0, a: 0 };
      e.n++;
      e.s += c;
      e.a += Math.abs(c);
      acc.set(midi, e);
    }
  const out = new Map<number, NoteStat>();
  for (const [midi, e] of acc) out.set(midi, { midi, count: e.n, mean: e.s / e.n, meanAbs: e.a / e.n });
  return out;
}

export interface Summary {
  sessions: number;
  notes: number;
  /** Share of notes within ±10 cents. */
  inTune: number;
  meanAbs: number;
  minutes: number;
}

export function summarise(sessions: SessionRecord[]): Summary {
  let notes = 0;
  let inTune = 0;
  let abs = 0;
  let seconds = 0;
  for (const s of sessions) {
    seconds += s.seconds;
    for (const [, c] of s.notes) {
      notes++;
      abs += Math.abs(c);
      if (Math.abs(c) <= 10) inTune++;
    }
  }
  return { sessions: sessions.length, notes, inTune: notes ? inTune / notes : 0, meanAbs: notes ? abs / notes : 0, minutes: seconds / 60 };
}
