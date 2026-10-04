// Value normalizers: E.164 phones, ISO dates (with ambiguity flags), money in
// a base currency, name casing and splitting, canonical emails, company keys,
// street abbreviations and country codes.

import { fold, tokens } from "./strsim";

// ------------------------------------------------------------------ countries

const COUNTRY_NAMES: Record<string, string> = {
  "united kingdom": "GB", uk: "GB", "u k": "GB", "great britain": "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB", gb: "GB", gbr: "GB",
  "united states": "US", "united states of america": "US", usa: "US", "u s a": "US", "u s": "US", us: "US", america: "US",
  germany: "DE", deutschland: "DE", de: "DE", deu: "DE", ger: "DE",
  france: "FR", fr: "FR", fra: "FR",
  netherlands: "NL", "the netherlands": "NL", holland: "NL", nederland: "NL", nl: "NL", nld: "NL",
  spain: "ES", espana: "ES", es: "ES", esp: "ES",
  ireland: "IE", eire: "IE", "republic of ireland": "IE", ie: "IE", irl: "IE",
  sweden: "SE", sverige: "SE", se: "SE", swe: "SE",
  italy: "IT", italia: "IT", it: "IT", belgium: "BE", be: "BE", austria: "AT", at: "AT", switzerland: "CH", ch: "CH",
  denmark: "DK", dk: "DK", norway: "NO", no: "NO", finland: "FI", fi: "FI", portugal: "PT", pt: "PT", poland: "PL", pl: "PL",
  canada: "CA", ca: "CA", australia: "AU", au: "AU",
};

export const COUNTRY_CODES = new Set(Object.values(COUNTRY_NAMES));

const countryCache = new Map<string, string | null>();

export function toCountry(raw: string): string | null {
  if (raw.length > 32) return null;
  const hit = countryCache.get(raw);
  if (hit !== undefined) return hit;
  const key = fold(raw).replace(/[^a-z]+/g, " ").trim();
  const out = key ? (COUNTRY_NAMES[key] ?? null) : null;
  if (countryCache.size > 50000) countryCache.clear();
  countryCache.set(raw, out);
  return out;
}

// ------------------------------------------------------------------ phones

interface PhonePlan {
  code: string;
  trunk: string | null;
  nsn: [number, number];
}

export const PHONE_PLANS: Record<string, PhonePlan> = {
  GB: { code: "44", trunk: "0", nsn: [9, 10] },
  US: { code: "1", trunk: "1", nsn: [10, 10] },
  CA: { code: "1", trunk: "1", nsn: [10, 10] },
  DE: { code: "49", trunk: "0", nsn: [6, 11] },
  FR: { code: "33", trunk: "0", nsn: [9, 9] },
  NL: { code: "31", trunk: "0", nsn: [9, 9] },
  ES: { code: "34", trunk: null, nsn: [9, 9] },
  IE: { code: "353", trunk: "0", nsn: [7, 9] },
  SE: { code: "46", trunk: "0", nsn: [7, 9] },
  IT: { code: "39", trunk: null, nsn: [6, 11] },
  BE: { code: "32", trunk: "0", nsn: [8, 9] },
  AT: { code: "43", trunk: "0", nsn: [4, 13] },
  CH: { code: "41", trunk: "0", nsn: [9, 9] },
  DK: { code: "45", trunk: null, nsn: [8, 8] },
  NO: { code: "47", trunk: null, nsn: [8, 8] },
  FI: { code: "358", trunk: "0", nsn: [5, 12] },
  PT: { code: "351", trunk: null, nsn: [9, 9] },
  PL: { code: "48", trunk: null, nsn: [9, 9] },
  AU: { code: "61", trunk: "0", nsn: [9, 9] },
};

const BY_CODE = new Map<string, string>();
for (const [cc, p] of Object.entries(PHONE_PLANS)) if (!BY_CODE.has(p.code)) BY_CODE.set(p.code, cc);

export interface PhoneResult {
  e164: string | null;
  country: string | null;
  reason?: "empty" | "too short" | "too long" | "unknown country" | "bad length";
}

/** Parses a phone written any national or international way into E.164, using the record's country when it is national. */
export function toE164(raw: string, country: string | null): PhoneResult {
  let s = raw.trim().replace(/(?:ext\.?|extension|x|#)\s*\d{1,5}$/i, "");
  if (!/\d/.test(s)) return { e164: null, country: null, reason: "empty" };
  s = s.replace(/\(0\)/g, " ");
  let intl = false;
  let digits = s.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    intl = true;
    digits = digits.slice(1);
  } else if (digits.startsWith("00")) {
    intl = true;
    digits = digits.slice(2);
  } else if (digits.startsWith("011") && country === "US" && digits.length > 13) {
    intl = true;
    digits = digits.slice(3);
  }
  digits = digits.replace(/\+/g, "");
  if (digits.length < 6) return { e164: null, country: null, reason: "too short" };
  if (digits.length > 17) return { e164: null, country: null, reason: "too long" };

  if (intl) {
    for (const len of [1, 2, 3]) {
      const cc = BY_CODE.get(digits.slice(0, len));
      if (!cc) continue;
      const plan = PHONE_PLANS[cc];
      let nsn = digits.slice(len);
      if (plan.trunk === "0" && nsn.startsWith("0")) nsn = nsn.slice(1);
      if (nsn.length < plan.nsn[0] || nsn.length > plan.nsn[1]) return { e164: null, country: cc, reason: "bad length" };
      return { e164: `+${plan.code}${nsn}`, country: cc };
    }
    if (digits.length >= 8 && digits.length <= 15) return { e164: `+${digits}`, country: null };
    return { e164: null, country: null, reason: "unknown country" };
  }

  const plan = country ? PHONE_PLANS[country] : undefined;
  if (!plan) return { e164: null, country: null, reason: "unknown country" };
  let nsn = digits;
  if (plan.trunk && nsn.startsWith(plan.trunk) && nsn.length > plan.nsn[0]) nsn = nsn.slice(plan.trunk.length);
  // someone wrote the country code without a plus sign: "44 20 7946 0123"
  else if (nsn.startsWith(plan.code) && nsn.length - plan.code.length >= plan.nsn[0] && nsn.length > plan.nsn[1]) nsn = nsn.slice(plan.code.length);
  if (nsn.length < plan.nsn[0] || nsn.length > plan.nsn[1]) return { e164: null, country, reason: "bad length" };
  return { e164: `+${plan.code}${nsn}`, country };
}

// ------------------------------------------------------------------ dates

export type DateOrder = "DMY" | "MDY";

export interface DateResult {
  iso: string | null;
  /** Day and month were both ≤ 12 and different, so the order decided it. */
  ambiguous: boolean;
  format: "iso" | "epoch-s" | "epoch-ms" | "dmy" | "mdy" | "text" | "invalid" | "empty";
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function ymd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || y < 1800 || y > 2200) return null;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > dim) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Two-digit years at or below the pivot are 20xx, above it 19xx. */
export function expandYear(y: number, pivot = 30): number {
  if (y >= 100) return y;
  return y <= pivot ? 2000 + y : 1900 + y;
}

export function parseDate(raw: string, order: DateOrder | null = null, pivot = 30): DateResult {
  const s = raw.trim();
  if (!s) return { iso: null, ambiguous: false, format: "empty" };
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
  if (m) {
    const iso = ymd(+m[1], +m[2], +m[3]);
    return { iso, ambiguous: false, format: iso ? "iso" : "invalid" };
  }
  if (/^\d{9,10}$/.test(s) || /^\d{12,13}$/.test(s)) {
    const msec = s.length >= 12 ? Number(s) : Number(s) * 1000;
    const d = new Date(msec);
    const y = d.getUTCFullYear();
    if (y < 1970 || y > 2100) return { iso: null, ambiguous: false, format: "invalid" };
    return { iso: `${y}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, ambiguous: false, format: s.length >= 12 ? "epoch-ms" : "epoch-s" };
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = expandYear(+m[3], pivot);
    let dmy: boolean;
    let ambiguous = false;
    if (a > 12 && b <= 12) dmy = true;
    else if (b > 12 && a <= 12) dmy = false;
    else {
      ambiguous = a !== b && a <= 12 && b <= 12;
      // the column's convention, else the separator's habit: dots are European day-first
      dmy = order ? order === "DMY" : s.includes(".") || s.includes("/");
    }
    const iso = dmy ? ymd(y, b, a) : ymd(y, a, b);
    return { iso, ambiguous: !!iso && ambiguous, format: iso ? (dmy ? "dmy" : "mdy") : "invalid" };
  }
  m = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?[\s-,]+(\d{4})$/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const iso = ymd(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    return { iso, ambiguous: false, format: iso ? "text" : "invalid" };
  }
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) {
    const iso = ymd(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
    return { iso, ambiguous: false, format: iso ? "text" : "invalid" };
  }
  return { iso: null, ambiguous: false, format: "invalid" };
}

/** Reads a column's day/month order from the values that can only be read one way. */
export function inferDateOrder(values: Iterable<string>): { order: DateOrder | null; dmy: number; mdy: number } {
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    const m = /^\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\s*$/.exec(v);
    if (!m) continue;
    if (+m[1] > 12 && +m[2] <= 12) dmy++;
    else if (+m[2] > 12 && +m[1] <= 12) mdy++;
  }
  return { order: dmy > mdy ? "DMY" : mdy > dmy ? "MDY" : null, dmy, mdy };
}

// ------------------------------------------------------------------ money

/** Fixed demo rates into EUR. Not live: they only make amounts comparable. */
export const RATES_TO_EUR: Record<string, number> = { EUR: 1, GBP: 1.17, USD: 0.92, SEK: 0.088, CHF: 1.05, DKK: 0.134, NOK: 0.086, PLN: 0.23, CAD: 0.68, AUD: 0.61 };
export const BASE_CURRENCY = "EUR";

const SYMBOLS: [RegExp, string][] = [
  [/US\$|\$US/i, "USD"],
  [/£/, "GBP"],
  [/€/, "EUR"],
  [/\$/, "USD"],
  [/\bkr\b\.?/i, "SEK"],
  [/\bCHF\b|\bFr\.\s/, "CHF"],
  [/zł/i, "PLN"],
];

export interface MoneyResult {
  amount: number | null;
  currency: string | null;
  decimalComma: boolean;
}

export function parseMoney(raw: string, fallbackCurrency: string | null = null): MoneyResult {
  let s = raw.trim();
  if (!s || !/\d/.test(s)) return { amount: null, currency: null, decimalComma: false };
  let currency: string | null = null;
  const code = /\b([A-Z]{3})\b/.exec(s);
  if (code && RATES_TO_EUR[code[1]]) {
    currency = code[1];
    s = s.replace(code[0], " ");
  }
  for (const [re, cur] of SYMBOLS)
    if (re.test(s)) {
      currency ??= cur;
      s = s.replace(re, " ");
    }
  let negative = false;
  if (/^\s*\(.*\)\s*$/.test(s) || /-\s*\d/.test(s) || /\d\s*-\s*$/.test(s)) negative = true;
  s = s.replace(/[\s  '’()+-]/g, "");
  if (!/^[\d.,]+$/.test(s)) return { amount: null, currency: currency ?? fallbackCurrency, decimalComma: false };
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let decimalComma = false;
  let num: string;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalComma = lastComma > lastDot;
    num = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const count = s.split(sep).length - 1;
    const after = s.length - Math.max(lastComma, lastDot) - 1;
    // one separator followed by 1–2 digits is a decimal point; groups of three are thousands
    const isDecimal = count === 1 && after !== 3;
    if (isDecimal) {
      decimalComma = sep === ",";
      num = s.replace(sep, ".");
    } else num = s.split(sep).join("");
  } else num = s;
  const amount = Number(num);
  if (!Number.isFinite(amount)) return { amount: null, currency: currency ?? fallbackCurrency, decimalComma };
  return { amount: negative ? -amount : amount, currency: currency ?? fallbackCurrency, decimalComma };
}

export function toBase(amount: number | null, currency: string | null): number | null {
  if (amount === null || !currency || !(currency in RATES_TO_EUR)) return null;
  return Math.round(amount * RATES_TO_EUR[currency] * 100) / 100;
}

/** The usual currency for a country, used when a source writes a bare number. */
export const COUNTRY_CURRENCY: Record<string, string> = {
  GB: "GBP", US: "USD", DE: "EUR", FR: "EUR", NL: "EUR", ES: "EUR", IE: "EUR", SE: "SEK", IT: "EUR", BE: "EUR", AT: "EUR", CH: "CHF", DK: "DKK", NO: "NOK", FI: "EUR", PT: "EUR", PL: "PLN", CA: "CAD", AU: "AUD",
};

// ------------------------------------------------------------------ names

const PARTICLES = new Set(["van", "von", "der", "den", "de", "la", "le", "du", "da", "di", "del", "dos", "das", "ter", "ten", "af", "zu"]);
const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "prof", "sir", "dame", "herr", "frau", "mme", "mlle", "sr", "sra"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "phd", "md", "esq"]);

function capWord(w: string): string {
  if (!w) return w;
  const lower = w.toLowerCase();
  let out = lower.replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
  if (/^mc\p{L}/u.test(lower)) out = "Mc" + out[2].toUpperCase() + out.slice(3);
  return out;
}

/** Fixes casing only when a name arrives ALL CAPS or all lower; mixed case is trusted as written. */
export function properCase(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return s;
  const letters = s.replace(/[^\p{L}]/gu, "");
  const allUpper = letters === letters.toUpperCase();
  const allLower = letters === letters.toLowerCase();
  if (!allUpper && !allLower) return s;
  return s
    .split(" ")
    .map((w, i) => (i > 0 && PARTICLES.has(w.toLowerCase()) ? w.toLowerCase() : capWord(w)))
    .join(" ");
}

export interface SplitName {
  first: string;
  last: string;
  /** "Last, First" form was used. */
  comma: boolean;
}

/** Splits a full name, handling "Last, First", honorifics, middle names and particles (Anna van Dijk). */
export function splitFullName(raw: string): SplitName {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return { first: "", last: "", comma: false };
  const clean = (parts: string[]) => parts.filter((p) => !HONORIFICS.has(p.toLowerCase().replace(/\./g, "")) && !SUFFIXES.has(p.toLowerCase().replace(/\./g, "")));
  if (s.includes(",")) {
    const [lastPart, rest] = s.split(/,(.*)/s);
    const firsts = clean(rest.trim().split(" ").filter(Boolean));
    return { first: firsts[0] ?? "", last: lastPart.trim(), comma: true };
  }
  const parts = clean(s.split(" "));
  if (parts.length === 1) return { first: "", last: parts[0], comma: false };
  let lastStart = parts.length - 1;
  while (lastStart > 1 && PARTICLES.has(parts[lastStart - 1].toLowerCase())) lastStart--;
  return { first: parts[0], last: parts.slice(lastStart).join(" "), comma: false };
}

// ------------------------------------------------------------------ email

export interface EmailResult {
  email: string;
  valid: boolean;
  plusTag: boolean;
  recased: boolean;
}

const EMAIL_RE = /^[a-z0-9._%'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** Lowercase, trimmed, `mailto:` and `+tags` removed. */
export function canonicalEmail(raw: string): EmailResult {
  let s = raw.trim().replace(/^mailto:/i, "");
  const recased = s !== s.toLowerCase();
  s = s.toLowerCase();
  const at = s.lastIndexOf("@");
  let plusTag = false;
  if (at > 0) {
    const local = s.slice(0, at);
    const plus = local.indexOf("+");
    if (plus > 0) {
      plusTag = true;
      s = local.slice(0, plus) + s.slice(at);
    }
  }
  return { email: s, valid: EMAIL_RE.test(s), plusTag, recased };
}

// ------------------------------------------------------------------ companies

const LEGAL = new Set(["ltd", "limited", "llc", "inc", "incorporated", "corp", "corporation", "gmbh", "ag", "sa", "sas", "sarl", "bv", "nv", "ab", "plc", "co", "company", "oy", "aps", "srl", "spa", "llp", "lp", "kg", "ug", "sl", "se"]);

/** Comparison key: folded, '&' read as 'and', punctuation and legal-form suffixes removed. */
export function companyKey(raw: string): string {
  let t = fold(raw)
    .replace(/&/g, " and ")
    .replace(/\b(l)\.?\s?(l)\.?\s?(c)\.?/g, "llc")
    .replace(/\b(b)\.\s?(v)\./g, "bv")
    .replace(/\b(s)\.\s?(a)\./g, "sa")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ");
  while (t.length > 1 && LEGAL.has(t[t.length - 1])) t = t.slice(0, -1);
  if (t[0] === "the" && t.length > 1) t = t.slice(1);
  return t.join(" ");
}

const SUFFIX_DISPLAY: Record<string, string> = { ltd: "Ltd", limited: "Limited", llc: "LLC", inc: "Inc", gmbh: "GmbH", ag: "AG", sa: "SA", bv: "BV", nv: "NV", ab: "AB", plc: "PLC", sarl: "SARL", sas: "SAS", llp: "LLP" };

export function companyDisplay(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  const letters = s.replace(/[^\p{L}]/gu, "");
  if (letters !== letters.toUpperCase() && letters !== letters.toLowerCase()) return s;
  return s
    .split(" ")
    .map((w) => SUFFIX_DISPLAY[w.toLowerCase().replace(/\./g, "")] ?? (w === "&" ? w : capWord(w)))
    .join(" ");
}

// ------------------------------------------------------------------ addresses

const STREET_ABBR: Record<string, string> = {
  st: "Street", str: "Street", rd: "Road", ave: "Avenue", av: "Avenue", ln: "Lane", dr: "Drive", blvd: "Boulevard", ct: "Court", pl: "Place",
  sq: "Square", hwy: "Highway", pkwy: "Parkway", cres: "Crescent", ter: "Terrace", terr: "Terrace", gdns: "Gardens", cl: "Close", mt: "Mount",
};

/** Expands street-type abbreviations that come after the name (12 High St. → 12 High Street); a leading "St" stays Saint. */
export function expandStreet(raw: string): string {
  const s = properCase(raw);
  const parts = s.split(" ");
  return parts
    .map((w, i) => {
      const k = w.toLowerCase().replace(/[.,]$/, "");
      const trailingComma = w.endsWith(",") ? "," : "";
      if (i > 0 && STREET_ABBR[k] && !(k === "st" && /^\p{L}/u.test(parts[i + 1] ?? "") && i < parts.length - 1)) return STREET_ABBR[k] + trailingComma;
      // German: Hauptstr. → Hauptstraße
      if (/str\.$/i.test(w) && w.length > 5) return w.slice(0, -4) + "straße";
      return w;
    })
    .join(" ");
}

/** Street tokens for comparison: folded, abbreviations expanded, flat/unit words dropped. */
export function streetTokens(raw: string): string[] {
  return tokens(expandStreet(raw).replace(/straße/gi, "strasse")).filter((t) => !["flat", "apt", "unit", "suite", "no"].includes(t));
}

export function normalizePostcode(raw: string, country: string | null): string {
  let s = raw.trim().toUpperCase().replace(/\s+/g, " ");
  const compact = s.replace(/\s/g, "");
  if (country === "GB" && /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)) s = compact.slice(0, -3) + " " + compact.slice(-3);
  else if (country === "NL" && /^\d{4}[A-Z]{2}$/.test(compact)) s = compact.slice(0, 4) + " " + compact.slice(4);
  else if (country === "SE" && /^\d{5}$/.test(compact)) s = compact.slice(0, 3) + " " + compact.slice(3);
  else if (country === "IE" && /^[A-Z]\d[\dW][A-Z\d]{4}$/.test(compact)) s = compact.slice(0, 3) + " " + compact.slice(3);
  return s;
}

export const NULL_TOKENS = new Set(["", "n/a", "na", "null", "none", "nil", "-", "--", "?", "unknown", "not provided", "tbc", "#n/a", "undefined"]);

export function isNullish(v: string): boolean {
  return NULL_TOKENS.has(v.trim().toLowerCase());
}
