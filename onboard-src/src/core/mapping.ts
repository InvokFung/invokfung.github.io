// Schema mapping: every source column scored against every canonical field
// on two kinds of evidence, the header's words and the values' profile, then
// one-to-one assignment by the Hungarian algorithm. Exports YAML and SQL.

import { classify, type ColumnProfile } from "./profile";
import { FIELDS, FIELD, type FieldKey } from "./schema";
import { companyKey, isNullish, parseDate, toCountry } from "./normalize";
import { fold, jaroWinkler, tokens } from "./strsim";
import type { Table } from "./types";

export interface Candidate {
  field: FieldKey;
  score: number;
  name: number;
  value: number;
}

export interface ColumnMapping {
  column: string;
  index: number;
  field: FieldKey | null;
  confidence: number;
  name: number;
  value: number;
  candidates: Candidate[];
  overridden?: boolean;
}

export type SourceMapping = ColumnMapping[];

/** Minimum score to map a column at all. */
export const MAP_THRESHOLD = 0.42;

const STOP = new Set(["the", "of", "a", "an", "customer", "client", "cust", "acct"]);

function stem(t: string): string {
  return t.length > 4 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;
}

export function headerTokens(h: string): string[] {
  const spaced = h.replace(/\[\d+\]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/#/g, " number ");
  const t = tokens(spaced).map(stem);
  const kept = t.filter((x) => !STOP.has(x));
  return kept.length ? kept : t;
}

const GENERIC = /^(col|column|field|f|c|var|attr|unnamed)[\s_:-]?\d*$/i;

/** Fields whose values identify them on their own: a column of recognisable country names is a country column whatever its header says. */
const DISTINCTIVE = new Set<FieldKey>(["email", "phone", "country", "currency"]);

function tokenMatch(a: string, b: string): boolean {
  return a === b || (a.length > 3 && b.length > 3 && jaroWinkler(a, b) >= 0.92);
}

/** How well a header names a field: coverage of the best synonym's words, discounted for extra words. */
export function nameScore(header: string, field: FieldKey): number {
  const h = headerTokens(header);
  if (!h.length) return 0;
  const hJoined = h.join("");
  let best = 0;
  for (const syn of FIELD[field].synonyms) {
    const s = headerTokens(syn);
    if (!s.length) continue;
    if (hJoined === s.join("")) return 1;
    let covered = 0;
    const usedH = new Set<number>();
    for (const st of s) {
      const j = h.findIndex((ht, k) => !usedH.has(k) && tokenMatch(ht, st));
      if (j >= 0) {
        covered++;
        usedH.add(j);
      }
    }
    const coverage = covered / s.length;
    const precision = usedH.size / h.length;
    let score = coverage * (0.6 + 0.4 * precision);
    if (coverage < 1) score *= 0.75;
    best = Math.max(best, score);
  }
  return best;
}

const POSTCODE = [/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i, /^\d{5}(-\d{4})?$/, /^\d{4} ?[A-Z]{2}$/i, /^\d{3} ?\d{2}$/, /^[A-Z]\d[\dW] ?[A-Z\d]{4}$/i, /^\d{4}$/];

/** How well a column's values fit a field, 0..1, from a sample of non-null values and the profile. */
export function valueScore(field: FieldKey, values: string[], p: ColumnProfile): number {
  const n = values.length;
  if (!n) return 0;
  const share = (pred: (v: string) => boolean) => values.reduce((a, v) => a + (pred(v) ? 1 : 0), 0) / n;
  const typeShare = (...ts: string[]) => ts.reduce((a, t) => a + (p.types[t as keyof typeof p.types] ?? 0), 0) / Math.max(1, p.rows - p.nulls);
  const unique = p.distinct / Math.max(1, p.rows - p.nulls);
  switch (field) {
    case "source_id":
      return unique >= 0.97 ? Math.max(typeShare("identifier", "integer"), 0.5) : unique * 0.3;
    case "first_name":
    case "last_name":
      return typeShare("name") * (unique > 0.02 ? 1 : 0.4);
    case "full_name":
      return share((v) => classify(v) === "fullname" && !/\b(ltd|limited|llc|gmbh|inc|plc|bv|ab|sa)\b\.?/i.test(v));
    case "email":
      return typeShare("email");
    case "phone":
      return typeShare("phone");
    case "company":
      return Math.min(1, share((v) => /&|\band\b/i.test(v) || companyKey(v) !== fold(v).replace(/[^a-z0-9]+/g, " ").trim()) * 2.5);
    case "street":
      return typeShare("address");
    case "city":
      return typeShare("name", "fullname") * (unique < 0.3 ? 1 : 0.3);
    case "postcode":
      return share((v) => POSTCODE.some((re) => re.test(v.trim())));
    case "country":
      return share((v) => toCountry(v) !== null) * (unique < 0.1 ? 1 : 0.5);
    case "date_of_birth":
    case "created_at":
    case "updated_at": {
      const [lo, hi] = field === "date_of_birth" ? [1925, 2012] : field === "created_at" ? [1995, 2030] : [2010, 2030];
      return share((v) => {
        const iso = parseDate(v).iso;
        if (!iso) return false;
        const y = Number(iso.slice(0, 4));
        return y >= lo && y <= hi;
      });
    }
    case "balance":
      return typeShare("money", "decimal") + 0.6 * typeShare("integer") > 0.5 ? Math.min(1, typeShare("money", "decimal") + 0.6 * typeShare("integer")) : 0;
    case "currency":
      return typeShare("currency");
    case "notes":
      return Math.min(1, typeShare("text") * 1.3) * (p.meanLength > 20 ? 1 : 0.4);
  }
}

/** Hungarian algorithm (shortest augmenting paths, O(n²m)) for a cost matrix with n ≤ m; returns the column assigned to each row. */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (!n) return [];
  const m = cost[0].length;
  if (m < n) throw new Error("need at least as many columns as rows");
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(INF);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const ans = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) ans[p[j] - 1] = j - 1;
  return ans;
}

/** Scores every column against every field and assigns one-to-one. */
export function autoMap(table: Table, profiles: ColumnProfile[]): SourceMapping {
  const cols = table.columns.map((column, index) => {
    const values: string[] = [];
    for (let r = 0; r < table.rows.length && values.length < 300; r += Math.max(1, Math.floor(table.rows.length / 300))) {
      const v = table.rows[r][index] ?? "";
      if (!isNullish(v)) values.push(v);
    }
    const generic = GENERIC.test(column.trim()) || !column.trim();
    const candidates: Candidate[] = FIELDS.map((f) => {
      const name = generic ? 0 : nameScore(column, f.key);
      const value = valueScore(f.key, values, profiles[index]);
      let score = generic ? 0.75 * value : 0.6 * name + 0.4 * value;
      // the header may say "Last Reply", but if the values are clearly not last names, the header loses
      if (!generic && value < 0.15 && profiles[index].rows > profiles[index].nulls) score *= 0.6;
      // and the other way round: "Region" or "Ctry" holding unmistakable country names still maps, with lower confidence
      if (DISTINCTIVE.has(f.key) && value >= 0.9) score = Math.max(score, 0.6 * value);
      return { field: f.key, score: Math.round(score * 1000) / 1000, name, value };
    }).sort((a, b) => b.score - a.score);
    return { column, index, candidates };
  });

  // rows: columns; columns: fields, then one "unmapped" slot per source column
  const F = FIELDS.length;
  const cost = cols.map((c) => {
    const row = new Array<number>(F + cols.length).fill(1 - MAP_THRESHOLD);
    for (const cand of c.candidates) row[FIELDS.findIndex((f) => f.key === cand.field)] = 1 - cand.score;
    return row;
  });
  const assign = hungarian(cost);

  const out: SourceMapping = cols.map((c, i) => {
    const j = assign[i];
    const field = j >= 0 && j < F ? FIELDS[j].key : null;
    const cand = field ? c.candidates.find((x) => x.field === field)! : c.candidates[0];
    return { column: c.column, index: c.index, field, confidence: field ? cand.score : 1 - cand.score, name: cand.name, value: cand.value, candidates: c.candidates.slice(0, 4) };
  });
  // a full-name column is redundant when first and last are both mapped; better left unmapped than guessed
  const has = (k: FieldKey) => out.some((m) => m.field === k);
  if (has("first_name") && has("last_name")) for (const m of out) if (m.field === "full_name" && m.name < 0.9) m.field = null;
  return out;
}

export function fieldColumns(mapping: SourceMapping): Partial<Record<FieldKey, number>> {
  const out: Partial<Record<FieldKey, number>> = {};
  for (const m of mapping) if (m.field) out[m.field] = m.index;
  return out;
}

// ------------------------------------------------------------------ exports

const yamlStr = (s: string) => (/^[\w .-]+$/.test(s) && !/^(true|false|null|yes|no|\d)/i.test(s) ? s : JSON.stringify(s));

export function toYaml(sources: { id: string; name: string; mapping: SourceMapping }[], generatedAt: string): string {
  const lines = [`# Onboard column mapping`, `# generated ${generatedAt}; confidence is the combined header and value score`, `canonical: customer`, `sources:`];
  for (const s of sources) {
    lines.push(`  ${s.id}:`, `    file: ${yamlStr(s.name)}`, `    columns:`);
    for (const m of s.mapping) {
      const conf = m.field ? `, confidence: ${m.confidence.toFixed(2)}` : "";
      const tag = m.overridden ? ", override: true" : "";
      lines.push(`      ${yamlStr(m.column)}: { field: ${m.field ?? "null"}${conf}${tag} }`);
    }
  }
  return lines.join("\n") + "\n";
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const sqlName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function toSql(sources: { id: string; name: string; mapping: SourceMapping }[], generatedAt: string): string {
  const out = [`-- Onboard column mapping, generated ${generatedAt}`, `-- One staging view per source, in the canonical customer schema, then their union.`, `-- Assumes each file is landed as-is in raw.<file>, flattened JSON paths as column names.`, ``];
  for (const s of sources) {
    const byField = new Map<FieldKey, ColumnMapping>();
    for (const m of s.mapping) if (m.field) byField.set(m.field, m);
    const select = FIELDS.map((f) => {
      const m = byField.get(f.key);
      const expr = m ? ident(m.column) : `CAST(NULL AS ${f.sql})`;
      return `  ${expr} AS ${f.key}`;
    });
    out.push(`CREATE VIEW stg_${sqlName(s.id)} AS`, `SELECT`, `  '${s.id}' AS source,`, select.join(",\n"), `FROM raw.${sqlName(s.name)};`, ``);
  }
  out.push(`CREATE VIEW customers_unioned AS`, sources.map((s) => `SELECT * FROM stg_${sqlName(s.id)}`).join("\nUNION ALL\n") + ";", ``);
  return out.join("\n");
}
