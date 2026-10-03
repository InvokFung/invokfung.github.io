// Turns a mapped table into canonical records: every value goes through its
// normalizer, every field remembers the column it came from, and the stage
// keeps count of what it changed.

import { fieldColumns, type SourceMapping } from "./mapping";
import { nicknameRoot } from "./nicknames";
import {
  canonicalEmail,
  companyDisplay,
  companyKey,
  COUNTRY_CURRENCY,
  expandStreet,
  inferDateOrder,
  isNullish,
  normalizePostcode,
  parseDate,
  parseMoney,
  properCase,
  splitFullName,
  streetTokens,
  toBase,
  toCountry,
  toE164,
  type DateOrder,
} from "./normalize";
import { soundex } from "./phonetic";
import type { FieldKey } from "./schema";
import { fold } from "./strsim";
import { FLAG, type MatchKeys, type Rec, type Table } from "./types";

export interface NormalizeStats {
  records: number;
  phones: { total: number; e164: number; changed: number; invalid: number };
  dates: { total: number; parsed: number; ambiguous: number; invalid: number; epoch: number; orders: { source: string; column: string; order: DateOrder | null; dmy: number; mdy: number }[] };
  money: { total: number; converted: number; decimalComma: number; currencies: Record<string, number> };
  emails: { total: number; valid: number; invalid: number; plusTags: number; recased: number };
  names: { recased: number; split: number; comma: number };
  countries: { total: number; resolved: number; filled: number };
  companies: { total: number; changed: number };
  streets: { total: number; expanded: number };
}

export function emptyStats(): NormalizeStats {
  return {
    records: 0,
    phones: { total: 0, e164: 0, changed: 0, invalid: 0 },
    dates: { total: 0, parsed: 0, ambiguous: 0, invalid: 0, epoch: 0, orders: [] },
    money: { total: 0, converted: 0, decimalComma: 0, currencies: {} },
    emails: { total: 0, valid: 0, invalid: 0, plusTags: 0, recased: 0 },
    names: { recased: 0, split: 0, comma: 0 },
    countries: { total: 0, resolved: 0, filled: 0 },
    companies: { total: 0, changed: 0 },
    streets: { total: 0, expanded: 0 },
  };
}

/** Name key: folded letters, with German umlaut spellings (ae, oe, ue between consonants) collapsed so Käthe, Kathe and Kaethe agree. */
export const nameKey = (s: string) =>
  fold(s)
    .replace(/[^a-z]/g, "")
    .replace(/([^aeiou])([aou])e(?=[^aeiou])/g, "$1$2");

export function matchKeys(r: Pick<Rec, "first" | "last" | "email" | "phone" | "company" | "street" | "postcode" | "city">): MatchKeys {
  const first = nameKey(r.first);
  const last = nameKey(r.last);
  const st = streetTokens(r.street);
  return {
    first,
    last,
    firstSx: first ? soundex(first) : "",
    lastSx: last ? soundex(last) : "",
    firstRoot: nicknameRoot(first),
    firstPlain: fold(r.first).replace(/[^a-z]/g, ""),
    lastPlain: fold(r.last).replace(/[^a-z]/g, ""),
    emailLocal: r.email ? r.email.slice(0, r.email.lastIndexOf("@")) : "",
    phoneTail: r.phone ? r.phone.slice(-7) : "",
    company: r.company ? companyKey(r.company) : "",
    street: st,
    houseNo: st.find((t) => /^\d+[a-z]?$/.test(t)) ?? "",
    postcode: r.postcode.replace(/\s/g, ""),
    city: fold(r.city).trim(),
  };
}

/** Normalizes one source. `start` is the global index of its first record. */
export function normalizeTable(table: Table, mapping: SourceMapping, start: number, stats: NormalizeStats): Rec[] {
  const col = fieldColumns(mapping);
  const cell = (row: string[], f: FieldKey) => {
    const c = col[f];
    if (c === undefined) return "";
    const v = row[c] ?? "";
    return isNullish(v) ? "" : v.trim();
  };

  // per-column conventions, read from the column as a whole
  const orders: Partial<Record<FieldKey, DateOrder | null>> = {};
  for (const f of ["date_of_birth", "created_at", "updated_at"] as FieldKey[]) {
    if (col[f] === undefined) continue;
    const inf = inferDateOrder(table.rows.map((r) => r[col[f]!] ?? ""));
    orders[f] = inf.order;
    stats.dates.orders.push({ source: table.source, column: table.columns[col[f]!], ...inf });
  }
  const countryVotes = new Map<string, number>();
  for (const r of table.rows) {
    const c = toCountry(cell(r, "country"));
    if (c) countryVotes.set(c, (countryVotes.get(c) ?? 0) + 1);
  }
  let defaultCountry: string | null = null;
  let best = 0;
  for (const [c, n] of countryVotes) if (n > best) (best = n), (defaultCountry = c);

  const date = (raw: string, f: FieldKey, flags: { v: number }) => {
    if (!raw) return "";
    stats.dates.total++;
    const d = parseDate(raw, orders[f] ?? null);
    if (!d.iso) {
      stats.dates.invalid++;
      flags.v |= FLAG.DATE_INVALID;
      return "";
    }
    stats.dates.parsed++;
    if (d.format === "epoch-s" || d.format === "epoch-ms") stats.dates.epoch++;
    if (d.ambiguous) {
      stats.dates.ambiguous++;
      flags.v |= FLAG.AMBIGUOUS_DATE;
    }
    return d.iso;
  };

  return table.rows.map((row, ri) => {
    const flags = { v: 0 };
    let first = cell(row, "first_name");
    let last = cell(row, "last_name");
    const full = cell(row, "full_name");
    if (!first && !last && full) {
      const sp = splitFullName(full);
      first = sp.first;
      last = sp.last;
      stats.names.split++;
      flags.v |= FLAG.NAME_SPLIT;
      if (sp.comma) {
        stats.names.comma++;
        flags.v |= FLAG.NAME_COMMA;
      }
    }
    const pf = properCase(first);
    const pl = properCase(last);
    if (pf !== first.replace(/\s+/g, " ") || pl !== last.replace(/\s+/g, " ")) {
      stats.names.recased++;
      flags.v |= FLAG.NAME_RECASED;
    }

    const rawCountry = cell(row, "country");
    let country = toCountry(rawCountry) ?? "";
    if (rawCountry) {
      stats.countries.total++;
      if (country) stats.countries.resolved++;
    }

    let email = "";
    const rawEmail = cell(row, "email");
    if (rawEmail) {
      stats.emails.total++;
      const e = canonicalEmail(rawEmail);
      if (e.plusTag) {
        stats.emails.plusTags++;
        flags.v |= FLAG.EMAIL_PLUS;
      }
      if (e.recased) stats.emails.recased++;
      if (e.valid) {
        stats.emails.valid++;
        email = e.email;
      } else {
        stats.emails.invalid++;
        flags.v |= FLAG.EMAIL_INVALID;
      }
    }

    let phone = "";
    const rawPhone = cell(row, "phone");
    if (rawPhone) {
      stats.phones.total++;
      const p = toE164(rawPhone, country || defaultCountry);
      if (p.e164) {
        stats.phones.e164++;
        if (p.e164 !== rawPhone) stats.phones.changed++;
        phone = p.e164;
        if (!country && p.country && !rawCountry) {
          country = p.country;
          stats.countries.filled++;
        }
      } else {
        stats.phones.invalid++;
        flags.v |= FLAG.PHONE_INVALID;
      }
    }

    const rawCompany = cell(row, "company");
    const company = rawCompany ? companyDisplay(rawCompany) : "";
    if (rawCompany) {
      stats.companies.total++;
      if (company !== rawCompany) stats.companies.changed++;
    }
    const rawStreet = cell(row, "street");
    const street = rawStreet ? expandStreet(rawStreet) : "";
    if (rawStreet) {
      stats.streets.total++;
      if (street !== rawStreet) stats.streets.expanded++;
    }
    const city = properCase(cell(row, "city"));
    const postcode = normalizePostcode(cell(row, "postcode"), country || defaultCountry);

    let balance: number | null = null;
    let currency = "";
    let balanceBase: number | null = null;
    const rawBal = cell(row, "balance");
    if (rawBal) {
      stats.money.total++;
      const fallback = cell(row, "currency").toUpperCase() || COUNTRY_CURRENCY[country || defaultCountry || ""] || null;
      const mres = parseMoney(rawBal, fallback);
      if (mres.amount !== null) {
        balance = mres.amount;
        currency = mres.currency ?? "";
        balanceBase = toBase(balance, currency);
        if (mres.decimalComma) stats.money.decimalComma++;
        if (balanceBase !== null) {
          stats.money.converted++;
          stats.money.currencies[currency] = (stats.money.currencies[currency] ?? 0) + 1;
          if (currency !== "EUR") flags.v |= FLAG.CURRENCY_CONVERTED;
        }
      }
    }

    const dob = date(cell(row, "date_of_birth"), "date_of_birth", flags);
    const created = date(cell(row, "created_at"), "created_at", flags);
    const updated = date(cell(row, "updated_at"), "updated_at", flags);

    const rec: Rec = {
      i: start + ri,
      source: table.source,
      row: ri,
      sourceId: cell(row, "source_id") || `${table.source}:${table.lines[ri]}`,
      first: pf,
      last: pl,
      email,
      phone,
      company,
      street,
      city,
      postcode,
      country,
      dob,
      created,
      updated,
      balance,
      currency,
      balanceBase,
      notes: cell(row, "notes"),
      col,
      k: undefined as unknown as MatchKeys,
      flags: flags.v,
    };
    rec.k = matchKeys(rec);
    stats.records++;
    return rec;
  });
}
