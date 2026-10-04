// Golden records: one row per resolved customer, each value chosen by a
// survivorship rule and linked back to the source record and cell it came
// from. Related fields survive together (a name, an address), so a golden
// record never pairs one system's street with another's postcode.

import type { FieldKey } from "./schema";
import { fold } from "./strsim";
import type { Rec, Table } from "./types";

export type SurvivorRule = "most_recent" | "most_complete" | "source_priority" | "most_frequent" | "earliest";

export const RULE_LABEL: Record<SurvivorRule, string> = {
  most_recent: "most recent",
  most_complete: "most complete record",
  source_priority: "source priority",
  most_frequent: "most frequent",
  earliest: "earliest",
};

export type GoldenKey = "name" | "email" | "phone" | "company" | "address" | "date_of_birth" | "created_at" | "balance";

export interface GoldenSpec {
  key: GoldenKey;
  label: string;
  fields: FieldKey[];
  rules: SurvivorRule[];
}

export const GOLDEN_FIELDS: GoldenSpec[] = [
  { key: "name", label: "Name", fields: ["first_name", "last_name", "full_name"], rules: ["most_frequent", "most_recent", "most_complete", "source_priority"] },
  { key: "email", label: "Email", fields: ["email"], rules: ["most_frequent", "most_recent", "most_complete", "source_priority"] },
  { key: "phone", label: "Phone", fields: ["phone"], rules: ["most_recent", "most_frequent", "most_complete", "source_priority"] },
  { key: "company", label: "Company", fields: ["company"], rules: ["most_frequent", "most_recent", "most_complete", "source_priority"] },
  { key: "address", label: "Address", fields: ["street", "city", "postcode", "country"], rules: ["most_recent", "most_frequent", "most_complete", "source_priority"] },
  { key: "date_of_birth", label: "Date of birth", fields: ["date_of_birth"], rules: ["most_frequent", "most_recent", "most_complete", "source_priority"] },
  { key: "created_at", label: "Customer since", fields: ["created_at"], rules: ["earliest", "most_recent", "source_priority"] },
  { key: "balance", label: "Balance (EUR)", fields: ["balance"], rules: ["source_priority", "most_recent", "most_complete"] },
];

export interface SurvivorConfig {
  rules: Record<GoldenKey, SurvivorRule>;
  /** Source ids, most trusted first. */
  priority: string[];
}

export type Preset = "recommended" | "most_recent" | "most_complete" | "source_priority";

export function preset(name: Preset, priority: string[]): SurvivorConfig {
  const rules = {} as Record<GoldenKey, SurvivorRule>;
  for (const g of GOLDEN_FIELDS) {
    if (name === "recommended") rules[g.key] = g.rules[0];
    else rules[g.key] = g.rules.includes(name) ? name : g.rules[0];
  }
  return { rules, priority };
}

export interface Lineage {
  rec: number;
  source: string;
  row: number;
  /** Row number in the file as delivered. */
  line: number;
  field: FieldKey;
  column: string;
  raw: string;
}

export interface GoldenValue {
  value: string;
  rule: SurvivorRule;
  lineage: Lineage[];
  /** Members with any value for this field, and how many of them agree with the winner. */
  candidates: number;
  agree: number;
  /** Distinct values that lost. */
  alternatives: string[];
}

export interface Golden {
  id: string;
  cluster: number;
  members: number[];
  sources: string[];
  values: Record<GoldenKey, GoldenValue | null>;
}

export function money(x: number): string {
  const [int, dec] = Math.abs(x).toFixed(2).split(".");
  return `${x < 0 ? "−" : ""}€${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec}`;
}

/** The comparable value of a field group on one record ("" when absent). */
export function groupValue(r: Rec, key: GoldenKey): string {
  switch (key) {
    case "name":
      return [r.first, r.last].filter(Boolean).join(" ");
    case "email":
      return r.email;
    case "phone":
      return r.phone;
    case "company":
      return r.company;
    case "address": {
      const place = [r.postcode, r.city].filter(Boolean).join(" ");
      return [r.street, place, r.country].filter(Boolean).join(", ");
    }
    case "date_of_birth":
      return r.dob;
    case "created_at":
      return r.created;
    case "balance":
      return r.balanceBase === null ? "" : money(r.balanceBase);
  }
}

const voteKey = (key: GoldenKey, v: string) => (key === "name" || key === "company" || key === "address" ? fold(v).replace(/[^a-z0-9]+/g, " ").trim() : v);

const recency = (r: Rec) => r.updated || r.created || "";

function completeness(r: Rec): number {
  let n = 0;
  for (const v of [r.first, r.last, r.email, r.phone, r.company, r.street, r.city, r.postcode, r.country, r.dob, r.created]) if (v) n++;
  return n + (r.balanceBase !== null ? 1 : 0);
}

export function buildGolden(recs: Rec[], members: number[][], tables: Map<string, Table>, config: SurvivorConfig): Golden[] {
  const rank = new Map(config.priority.map((s, i) => [s, i]));
  const prio = (r: Rec) => rank.get(r.source) ?? 99;
  const byPriority = (a: Rec, b: Rec) => prio(a) - prio(b) || (recency(b) > recency(a) ? 1 : recency(b) < recency(a) ? -1 : 0) || a.i - b.i;

  const lineageOf = (r: Rec, spec: GoldenSpec): Lineage[] => {
    const t = tables.get(r.source)!;
    const out: Lineage[] = [];
    for (const f of spec.fields) {
      const c = r.col[f];
      if (c === undefined) continue;
      const raw = t.rows[r.row][c] ?? "";
      if (!raw.trim()) continue;
      if (f === "full_name" && (r.col.first_name !== undefined || r.col.last_name !== undefined)) continue;
      out.push({ rec: r.i, source: r.source, row: r.row, line: t.lines[r.row], field: f, column: t.columns[c], raw });
    }
    return out;
  };

  return members.map((ids, cluster) => {
    const rs = ids.map((i) => recs[i]);
    const values = {} as Record<GoldenKey, GoldenValue | null>;
    for (const spec of GOLDEN_FIELDS) {
      const rule = config.rules[spec.key];
      const have = rs.filter((r) => groupValue(r, spec.key));
      if (!have.length) {
        values[spec.key] = null;
        continue;
      }
      // A city-only address must not replace a full one: when any record has a
      // street, the address unit is chosen among those records.
      const pool = spec.key === "address" && have.some((r) => r.street) ? have.filter((r) => r.street) : have;
      let win: Rec;
      switch (rule) {
        case "most_recent":
          win = [...pool].sort((a, b) => (recency(b) > recency(a) ? 1 : recency(b) < recency(a) ? -1 : byPriority(a, b)))[0];
          break;
        case "most_complete":
          win = [...pool].sort((a, b) => completeness(b) - completeness(a) || groupValue(b, spec.key).length - groupValue(a, spec.key).length || byPriority(a, b))[0];
          break;
        case "source_priority":
          win = [...pool].sort(byPriority)[0];
          break;
        case "earliest":
          win = [...pool].sort((a, b) => (groupValue(a, spec.key) < groupValue(b, spec.key) ? -1 : groupValue(a, spec.key) > groupValue(b, spec.key) ? 1 : byPriority(a, b)))[0];
          break;
        case "most_frequent": {
          const votes = new Map<string, Rec[]>();
          for (const r of pool) {
            const k = voteKey(spec.key, groupValue(r, spec.key));
            if (!votes.has(k)) votes.set(k, []);
            votes.get(k)!.push(r);
          }
          let best: Rec[] = [];
          for (const g of votes.values()) {
            if (g.length > best.length) best = g;
            else if (g.length === best.length && byPriority([...g].sort(byPriority)[0], [...best].sort(byPriority)[0]) < 0) best = g;
          }
          // within the winning value, prefer the most recent spelling
          win = [...best].sort((a, b) => (recency(b) > recency(a) ? 1 : recency(b) < recency(a) ? -1 : byPriority(a, b)))[0];
          break;
        }
      }
      const value = groupValue(win, spec.key);
      const wk = voteKey(spec.key, value);
      const alternatives = [...new Set(have.map((r) => groupValue(r, spec.key)).filter((v) => voteKey(spec.key, v) !== wk))];
      values[spec.key] = {
        value,
        rule,
        lineage: lineageOf(win, spec),
        candidates: have.length,
        agree: have.filter((r) => voteKey(spec.key, groupValue(r, spec.key)) === wk).length,
        alternatives,
      };
    }
    const sources = [...new Set(rs.map((r) => r.source))].sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
    return { id: `C${String(cluster + 1).padStart(5, "0")}`, cluster, members: ids, sources, values };
  });
}

/** Flat columns of a golden record, for tables, SQL and CSV export. */
export function goldenRow(g: Golden, recs: Rec[]): Record<string, string | number | null> {
  const pick = (key: GoldenKey) => g.values[key]?.lineage[0]?.rec;
  const nameRec = pick("name");
  const addrRec = pick("address");
  const n = nameRec !== undefined ? recs[nameRec] : null;
  const a = addrRec !== undefined ? recs[addrRec] : null;
  const balRec = pick("balance");
  return {
    golden_id: g.id,
    first_name: n?.first ?? null,
    last_name: n?.last ?? null,
    email: g.values.email?.value ?? null,
    phone: g.values.phone?.value ?? null,
    company: g.values.company?.value ?? null,
    street: a?.street || null,
    city: a?.city || null,
    postcode: a?.postcode || null,
    country: a?.country || null,
    date_of_birth: g.values.date_of_birth?.value ?? null,
    customer_since: g.values.created_at?.value ?? null,
    balance_eur: balRec !== undefined ? recs[balRec].balanceBase : null,
    sources: g.sources.join("+"),
    records: g.members.length,
  };
}
