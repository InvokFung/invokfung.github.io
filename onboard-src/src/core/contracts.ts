// Data-quality contracts: declarative rules checked on every run. Record
// rules run before matching, and a record that breaks a quarantine rule is
// held out of resolution and the golden table. Cluster and golden rules run
// after matching and check that the sources agree.

import { COUNTRY_CODES } from "./normalize";
import type { Rec } from "./types";

export type ContractField = "source_id" | "first_name" | "last_name" | "full_name" | "email" | "phone" | "country" | "date_of_birth" | "created_at" | "balance_eur" | "company" | "postcode";

export type Check =
  | { kind: "not_null"; fields: ContractField[]; mode: "all" | "any" }
  | { kind: "regex"; field: ContractField; pattern: string; flags?: string; negate?: boolean; raw?: boolean }
  | { kind: "range"; field: ContractField; min?: number | string; max?: number | string }
  | { kind: "allowed"; field: ContractField; values: string[] }
  | { kind: "unique"; field: ContractField; within: "source" | "golden" }
  | { kind: "consistent"; field: ContractField };

export interface Contract {
  id: string;
  description: string;
  scope: "record" | "cluster" | "golden";
  severity: "quarantine" | "warn";
  check: Check;
}

export const CONTRACTS: Contract[] = [
  { id: "identity_present", scope: "record", severity: "quarantine", description: "A record needs a last name, an email or a phone to be anyone", check: { kind: "not_null", fields: ["last_name", "email", "phone"], mode: "any" } },
  { id: "not_a_test_record", scope: "record", severity: "quarantine", description: "Test and placeholder rows stay out of the customer table", check: { kind: "regex", field: "full_name", pattern: "\\b(test|dummy|do not use|asdf|xxx+|sample)\\b", flags: "i", negate: true } },
  { id: "email_format", scope: "record", severity: "warn", description: "Email, where given, is a valid address (invalid ones are dropped)", check: { kind: "regex", field: "email", pattern: "^[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}$", raw: true } },
  { id: "phone_e164", scope: "record", severity: "warn", description: "Phone, where given, normalizes to E.164", check: { kind: "regex", field: "phone", pattern: "^\\+[1-9]\\d{6,14}$" } },
  { id: "country_known", scope: "record", severity: "warn", description: "Country resolves to an ISO 3166 code", check: { kind: "allowed", field: "country", values: [...COUNTRY_CODES].sort() } },
  { id: "dob_plausible", scope: "record", severity: "warn", description: "Date of birth between 1910 and 2010", check: { kind: "range", field: "date_of_birth", min: "1910-01-01", max: "2010-12-31" } },
  { id: "since_not_future", scope: "record", severity: "warn", description: "Customer-since date is not in the future", check: { kind: "range", field: "created_at", min: "1990-01-01", max: "2026-12-31" } },
  { id: "balance_range", scope: "record", severity: "warn", description: "Balance between −€100k and €1M once converted", check: { kind: "range", field: "balance_eur", min: -100000, max: 1000000 } },
  { id: "source_id_unique", scope: "record", severity: "warn", description: "Source IDs are unique within their source", check: { kind: "unique", field: "source_id", within: "source" } },
  { id: "country_consistent", scope: "cluster", severity: "warn", description: "Every source agrees on a customer's country", check: { kind: "consistent", field: "country" } },
  { id: "dob_consistent", scope: "cluster", severity: "warn", description: "Every source agrees on a customer's date of birth", check: { kind: "consistent", field: "date_of_birth" } },
  { id: "golden_email_unique", scope: "golden", severity: "warn", description: "No two golden customers share an email", check: { kind: "unique", field: "email", within: "golden" } },
];

export interface ContractResult {
  id: string;
  description: string;
  scope: Contract["scope"];
  severity: Contract["severity"];
  check: Check;
  checked: number;
  passed: number;
  failed: number;
  /** Record (or golden) indices that failed, first few. */
  samples: { index: number; value: string }[];
}

export function recValue(r: Rec, f: ContractField): string {
  switch (f) {
    case "source_id":
      return r.sourceId;
    case "first_name":
      return r.first;
    case "last_name":
      return r.last;
    case "full_name":
      return `${r.first} ${r.last}`.trim();
    case "email":
      return r.email;
    case "phone":
      return r.phone;
    case "country":
      return r.country;
    case "date_of_birth":
      return r.dob;
    case "created_at":
      return r.created;
    case "balance_eur":
      return r.balanceBase === null ? "" : String(r.balanceBase);
    case "company":
      return r.company;
    case "postcode":
      return r.postcode;
  }
}

const inRange = (v: string, min?: number | string, max?: number | string) => {
  if (typeof min === "number" || typeof max === "number") {
    const x = Number(v);
    return Number.isFinite(x) && (min === undefined || x >= (min as number)) && (max === undefined || x <= (max as number));
  }
  return (min === undefined || v >= min) && (max === undefined || v <= max);
};

function result(c: Contract): ContractResult {
  return { id: c.id, description: c.description, scope: c.scope, severity: c.severity, check: c.check, checked: 0, passed: 0, failed: 0, samples: [] };
}

function tally(res: ContractResult, ok: boolean, index: number, value: string) {
  res.checked++;
  if (ok) res.passed++;
  else {
    res.failed++;
    if (res.samples.length < 6) res.samples.push({ index, value });
  }
}

/** Record-scope contracts. `raw(r, field)` returns the source cell before normalization, for raw checks. */
export function checkRecords(recs: Rec[], raw: (r: Rec, f: ContractField) => string, contracts = CONTRACTS): { results: ContractResult[]; quarantine: Map<number, string[]> } {
  const quarantine = new Map<number, string[]>();
  const results: ContractResult[] = [];
  for (const c of contracts) {
    if (c.scope !== "record") continue;
    const res = result(c);
    const ck = c.check;
    const fail = (r: Rec, value: string) => {
      if (c.severity === "quarantine") {
        const why = quarantine.get(r.i) ?? [];
        why.push(c.id);
        quarantine.set(r.i, why);
      }
      tally(res, false, r.i, value);
    };
    if (ck.kind === "unique") {
      const seen = new Map<string, number>();
      for (const r of recs) {
        const v = recValue(r, ck.field);
        if (!v) continue;
        const key = `${r.source}\u0000${v}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      for (const r of recs) {
        const v = recValue(r, ck.field);
        if (!v) continue;
        if ((seen.get(`${r.source}\u0000${v}`) ?? 0) > 1) fail(r, v);
        else tally(res, true, r.i, v);
      }
      results.push(res);
      continue;
    }
    const re = ck.kind === "regex" ? new RegExp(ck.pattern, ck.flags) : null;
    const allowed = ck.kind === "allowed" ? new Set(ck.values) : null;
    for (const r of recs) {
      switch (ck.kind) {
        case "not_null": {
          const present = ck.fields.map((f) => !!recValue(r, f));
          const ok = ck.mode === "all" ? present.every(Boolean) : present.some(Boolean);
          if (ok) tally(res, true, r.i, "");
          else fail(r, "(empty)");
          break;
        }
        case "regex": {
          const v = ck.raw ? raw(r, ck.field) : recValue(r, ck.field);
          const source = ck.raw ? v : ck.field === "phone" && !v && raw(r, "phone") ? raw(r, "phone") : v;
          if (!source) break;
          const hit = re!.test(source);
          if (ck.negate ? !hit : hit) tally(res, true, r.i, source);
          else fail(r, source);
          break;
        }
        case "range": {
          const v = recValue(r, ck.field);
          if (!v) break;
          if (inRange(v, ck.min, ck.max)) tally(res, true, r.i, v);
          else fail(r, v);
          break;
        }
        case "allowed": {
          const v = recValue(r, ck.field) || raw(r, ck.field);
          if (!v) break;
          if (allowed!.has(v)) tally(res, true, r.i, v);
          else fail(r, v);
          break;
        }
      }
    }
    results.push(res);
  }
  return { results, quarantine };
}

/** Cluster-scope contracts: for each multi-record cluster, do the members agree? */
export function checkClusters(recs: Rec[], members: number[][], contracts = CONTRACTS): ContractResult[] {
  const out: ContractResult[] = [];
  for (const c of contracts) {
    if (c.scope !== "cluster" || c.check.kind !== "consistent") continue;
    const res = result(c);
    const field = c.check.field;
    members.forEach((ids, ci) => {
      const vals = new Set<string>();
      for (const i of ids) {
        const v = recValue(recs[i], field);
        if (v) vals.add(v);
      }
      if (vals.size === 0 || ids.length < 2) return;
      tally(res, vals.size === 1, ci, [...vals].join(" ≠ "));
    });
    out.push(res);
  }
  return out;
}

/** Golden-scope contracts over the final table. */
export function checkGolden(values: { email: string }[], contracts = CONTRACTS): ContractResult[] {
  const out: ContractResult[] = [];
  for (const c of contracts) {
    if (c.scope !== "golden" || c.check.kind !== "unique") continue;
    const res = result(c);
    const counts = new Map<string, number>();
    for (const g of values) if (g.email) counts.set(g.email, (counts.get(g.email) ?? 0) + 1);
    values.forEach((g, i) => {
      if (!g.email) return;
      tally(res, counts.get(g.email) === 1, i, g.email);
    });
    out.push(res);
  }
  return out;
}

/** The contracts as the YAML a team would keep in its repo. */
export function contractsYaml(contracts = CONTRACTS): string {
  const lines = ["contracts:"];
  for (const c of contracts) {
    lines.push(`  - id: ${c.id}`, `    scope: ${c.scope}`, `    severity: ${c.severity}`);
    const { kind, ...rest } = c.check as Check & Record<string, unknown>;
    const args = Object.entries(rest)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? (v.length > 6 ? `[${v.slice(0, 6).join(", ")}, …]` : `[${v.join(", ")}]`) : typeof v === "string" ? JSON.stringify(v) : v}`)
      .join(", ");
    lines.push(`    ${kind}: { ${args} }`);
  }
  return lines.join("\n");
}
