// Column profiling: inferred type, null share, exact and HyperLogLog
// distinct counts, format masks and top values. This is the evidence schema
// mapping and normalization lean on.

import { HyperLogLog } from "./hll";
import { isNullish, parseDate, RATES_TO_EUR, toCountry } from "./normalize";
import type { Table } from "./types";

export type ValueType =
  | "empty"
  | "email"
  | "phone"
  | "date"
  | "epoch"
  | "money"
  | "integer"
  | "decimal"
  | "currency"
  | "country"
  | "boolean"
  | "identifier"
  | "address"
  | "name"
  | "fullname"
  | "text"
  | "string";

export interface ColumnProfile {
  name: string;
  index: number;
  type: ValueType;
  /** Share of non-null values that have the column's type. */
  typeShare: number;
  types: Partial<Record<ValueType, number>>;
  rows: number;
  nulls: number;
  /** Values like "N/A", "null" or "-", counted in `nulls`. */
  nullTokens: number;
  distinct: number;
  distinctHll: number;
  /** (HLL − exact) / exact. */
  hllError: number;
  masks: { mask: string; count: number }[];
  top: { value: string; count: number }[];
  meanLength: number;
  /** For date columns: min and max year seen. */
  years?: [number, number];
}

const BOOL = new Set(["true", "false", "yes", "no", "y", "n"]);

export function classify(raw: string): ValueType {
  const v = raw.trim();
  if (isNullish(v)) return "empty";
  if (/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v)) return "email";
  if (/^\d{9,10}$|^\d{12,13}$/.test(v)) {
    const n = Number(v) * (v.length <= 10 ? 1000 : 1);
    const y = new Date(n).getUTCFullYear();
    if (y >= 1990 && y <= 2035) return "epoch";
  }
  if (/[\d]/.test(v) && v.length <= 32 && parseDate(v).iso) return "date";
  if (/^[-(]?\s*(?:[£€$]|US\$|[A-Z]{3}\s)\s?-?[\d.,'\s]+\)?$|^-?[\d.,'\s]+\s?(?:[£€$]|kr|[A-Z]{3})$/.test(v) && /\d/.test(v)) return "money";
  if (/^[+(]/.test(v) || /^0\d/.test(v) || /\d[\s.\-()]\d/.test(v)) {
    const digits = v.replace(/\D/g, "");
    if (/^[+()\d\s.\-\/]+$/.test(v) && digits.length >= 8 && digits.length <= 15 && !/^\d+[.,]\d{1,2}$/.test(v)) return "phone";
  }
  if (/^-?\d+$/.test(v)) return "integer";
  if (/^-?\d{1,3}(?:[,.']\d{3})*(?:[.,]\d+)?$|^-?\d+[.,]\d+$/.test(v)) return "decimal";
  if (/^[A-Z]{3}$/.test(v) && v in RATES_TO_EUR) return "currency";
  if (toCountry(v)) return "country";
  if (BOOL.has(v.toLowerCase())) return "boolean";
  if (/^\d+[a-zA-Z]?,?\s+\p{L}/u.test(v) || /^\p{L}[\p{L}.'\- ]+\s\d+[a-zA-Z]?$/u.test(v)) return "address";
  if (!/\s/.test(v) && /\d/.test(v) && /^[\w\-./#]+$/.test(v)) return "identifier";
  const words = v.split(/\s+/);
  const nameWord = /^[\p{Lu}][\p{L}'’\-.]*$/u;
  const anyCaseName = /^[\p{L}][\p{L}'’\-.]*$/u;
  if (words.length === 1 && anyCaseName.test(v) && v.length <= 24) return "name";
  if (words.length >= 2 && words.length <= 4 && (words.every((w) => nameWord.test(w) || /^(van|von|de|der|den|la|le|da|di|du),?$/.test(w)) || words.every((w) => anyCaseName.test(w.replace(/,$/, "")))) && v.length <= 48)
    return "fullname";
  if (words.length >= 5 || v.length > 48) return "text";
  return "string";
}

/** Format mask: A upper, a lower, 9 digit; letter runs compress (Robert → Aa+), digits stay literal (+99 99). */
export function formatMask(raw: string): string {
  let out = "";
  let prev = ""; // "a", "A" or " " while a run is open
  let run = 0;
  const flush = () => {
    if (prev === "a") out += run > 1 ? "a+" : "a";
    else if (prev === "A") out += run > 3 ? "A+" : "A".repeat(run);
    else if (prev === " ") out += " ";
    prev = "";
    run = 0;
  };
  const s = raw.trim();
  for (let i = 0; i < s.length && out.length < 40; i++) {
    const code = s.charCodeAt(i);
    let c: string;
    if (code >= 48 && code <= 57) c = "9";
    else if (code >= 65 && code <= 90) c = "A";
    else if (code >= 97 && code <= 122) c = "a";
    else if (code === 32 || code === 9 || code === 10 || code === 13) c = " ";
    else if (code > 127) {
      const ch = s[i];
      c = ch !== ch.toLowerCase() ? "A" : ch !== ch.toUpperCase() ? "a" : ch;
    } else c = s[i];
    if (c === prev) {
      run++;
      continue;
    }
    flush();
    if (c === "a" || c === "A" || c === " ") {
      prev = c;
      run = 1;
    } else out += c;
  }
  flush();
  return out.length > 36 ? out.slice(0, 35) + "…" : out;
}

function topN(counts: Map<string, number>, n: number): { value: string; count: number }[] {
  const arr: { value: string; count: number }[] = [];
  for (const [value, count] of counts) arr.push({ value, count });
  arr.sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1));
  return arr.slice(0, n);
}

export function profileColumn(table: Table, index: number): ColumnProfile {
  const types: Partial<Record<ValueType, number>> = {};
  const masks = new Map<string, number>();
  const hll = new HyperLogLog(12);
  let nulls = 0;
  let nullTokens = 0;
  let len = 0;
  let nonNull = 0;
  let yMin = Infinity;
  let yMax = -Infinity;
  // One pass to count raw values, then every distinct value is classified once, weighted by its count.
  const raw = new Map<string, number>();
  for (const row of table.rows) {
    const v = row[index] ?? "";
    raw.set(v, (raw.get(v) ?? 0) + 1);
  }
  const values = new Map<string, number>();
  for (const [v, n] of raw) {
    const t = classify(v);
    if (t === "empty") {
      nulls += n;
      if (v.trim()) nullTokens += n;
      continue;
    }
    nonNull += n;
    types[t] = (types[t] ?? 0) + n;
    const trimmed = v.trim();
    values.set(trimmed, (values.get(trimmed) ?? 0) + n);
    hll.add(trimmed); // idempotent, so adding each distinct value once is enough
    len += trimmed.length * n;
    const mk = formatMask(trimmed);
    masks.set(mk, (masks.get(mk) ?? 0) + n);
    if (t === "date" || t === "epoch") {
      const iso = parseDate(trimmed).iso;
      if (iso) {
        const y = Number(iso.slice(0, 4));
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
  }
  let type: ValueType = "empty";
  let best = 0;
  for (const [t, c] of Object.entries(types) as [ValueType, number][]) if (c > best) (best = c), (type = t);
  // A column of names where some rows hold two words is still a name column; a mix of dates and epochs is dates
  if ((type === "name" || type === "fullname") && (types.name ?? 0) + (types.fullname ?? 0) >= 0.8 * nonNull) {
    type = (types.fullname ?? 0) > 0.5 * nonNull ? "fullname" : "name";
    best = (types.name ?? 0) + (types.fullname ?? 0);
  }
  if ((type === "date" || type === "epoch") && (types.date ?? 0) + (types.epoch ?? 0) > best) best = (types.date ?? 0) + (types.epoch ?? 0);
  const distinct = values.size;
  const distinctHll = hll.count();
  return {
    name: table.columns[index],
    index,
    type,
    typeShare: nonNull ? best / nonNull : 0,
    types,
    rows: table.rows.length,
    nulls,
    nullTokens,
    distinct,
    distinctHll,
    hllError: distinct ? (distinctHll - distinct) / distinct : 0,
    masks: topN(masks, 5).map(({ value, count }) => ({ mask: value, count })),
    top: topN(values, 5),
    meanLength: nonNull ? len / nonNull : 0,
    years: yMin <= yMax ? [yMin, yMax] : undefined,
  };
}

export function profileTable(table: Table): ColumnProfile[] {
  return table.columns.map((_, i) => profileColumn(table, i));
}
