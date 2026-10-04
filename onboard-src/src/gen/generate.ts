// The synthetic customer base and its three disagreeing exports.
//
// ~4,000 true customers are spread over a CRM export (semicolon CSV with a
// BOM and CRLF), a billing system (nested NDJSON) and a support desk (comma
// CSV, other column names, full names in one column). Each copy of a
// customer is corrupted the way real systems corrupt data. The truth
// (entity of every row, the true column mapping, every injected PII span)
// is returned separately and is only ever used for evaluation.

import { formatIban, ibanCheckDigits, luhn, luhnCheckDigit } from "../core/checks";
import { toCsv } from "../core/csv";
import type { PiiType } from "../core/pii";
import { Rng } from "../core/rng";
import type { FieldKey } from "../core/schema";
import type { SourceFile } from "../core/types";
import {
  COINED,
  COUNTRIES,
  COUNTRY_SPELLINGS,
  COUNTRY_WEIGHTS,
  CURRENCY,
  FIRST,
  INDUSTRY,
  LAST,
  LEAD_SOURCES,
  LEGAL,
  MAIL_PROVIDERS,
  NICKNAMES,
  PLACES,
  PLANS,
  STAFF,
  SURNAME_PARTS,
  TAGS,
  type Country,
} from "./pools";

export const DEFAULT_SEED = "week-one";
export const DEFAULT_CUSTOMERS = 4000;

export interface TruthPii {
  source: string;
  row: number;
  column: string;
  type: PiiType;
  start: number;
  end: number;
  value: string;
}

export interface Truth {
  seed: string;
  customers: number;
  /** Entity key of every data row, per source, in file order. */
  entities: Record<string, string[]>;
  /** The true canonical field of every column (null: not part of the schema). */
  mapping: Record<string, Record<string, FieldKey | null>>;
  pii: TruthPii[];
}

export interface Generated {
  seed: string;
  files: SourceFile[];
  truth: Truth;
}

// ------------------------------------------------------------------ model

interface Phone {
  country: Country;
  area: string;
  rest: string;
  mobile: boolean;
}

interface Address {
  number: string;
  street: string;
  kind: string;
  city: string;
  postcode: string;
  country: Country;
}

interface Company {
  base: string;
  suffixGroup: string[];
  country: Country;
  domain: string;
  address: Address;
  switchboard: Phone;
}

interface Person {
  key: string;
  country: Country;
  first: string;
  last: string;
  dob: string;
  company: Company | null;
  workEmail: string | null;
  personalEmail: string | null;
  oldEmail: string | null;
  mobile: Phone;
  home: Phone | null;
  address: Address;
  oldAddress: Address | null;
  created: number;
  updated: number;
  balance: number;
}

const DAY = 86400000;
const TODAY = Date.UTC(2026, 5, 30);
const pad2 = (n: number) => String(n).padStart(2, "0");
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

const ASCII: Record<string, string> = { ß: "ss", ø: "o", Ø: "O", æ: "ae", Æ: "AE", ł: "l", Ł: "L", å: "a", Å: "A" };
function stripMarks(s: string, german = false): string {
  if (german) s = s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue");
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ßøØæÆłŁåÅ]/g, (c) => ASCII[c]);
}
const mailLocal = (s: string) => stripMarks(s).toLowerCase().replace(/[^a-z]/g, "");

const KEYBOARD = "qwertyuiop asdfghjkl zxcvbnm";
function neighbour(rng: Rng, c: string): string {
  const lower = c.toLowerCase();
  const i = KEYBOARD.indexOf(lower);
  if (i < 0) return c;
  const opts = [KEYBOARD[i - 1], KEYBOARD[i + 1]].filter((x) => x && x !== " ");
  const n = opts.length ? rng.pick(opts) : lower;
  return c === lower ? n : n.toUpperCase();
}

/** One realistic typo: neighbour key, dropped letter, doubled letter or two letters swapped. */
function typo(rng: Rng, s: string): string {
  if (s.length < 4) return s;
  const i = 1 + rng.int(s.length - 2);
  switch (rng.int(4)) {
    case 0:
      return s.slice(0, i) + neighbour(rng, s[i]) + s.slice(i + 1);
    case 1:
      return s.slice(0, i) + s.slice(i + 1);
    case 2:
      return s.slice(0, i) + s[i] + s.slice(i);
    default:
      return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
  }
}

// ------------------------------------------------------------------ places and phones

const GB_AREAS: Record<string, string[]> = { London: ["SW", "SE", "N", "E", "W", "NW", "EC"], Manchester: ["M"], Leeds: ["LS"], Bristol: ["BS"], Glasgow: ["G"], Edinburgh: ["EH"], Birmingham: ["B"], Norwich: ["NR"], York: ["YO"], Brighton: ["BN"], Cardiff: ["CF"] };
const PREFIX: Record<string, string> = {
  Portland: "972", Denver: "802", Austin: "787", Columbus: "432", Raleigh: "276", Madison: "537", Boise: "837", Tucson: "857", Omaha: "681", Savannah: "314",
  Berlin: "10", Hamburg: "20", München: "80", Köln: "50", Leipzig: "04", Dresden: "01", Stuttgart: "70", Bremen: "28",
  Paris: "750", Lyon: "6900", Lille: "5900", Nantes: "4400", Bordeaux: "3300", Toulouse: "3100", Rennes: "3500", Grenoble: "3800",
  Amsterdam: "10", Utrecht: "35", Rotterdam: "30", "Den Haag": "25", Eindhoven: "56", Groningen: "97",
  Madrid: "28", Barcelona: "08", Valencia: "46", Sevilla: "41", Bilbao: "48", Málaga: "29",
  Dublin: "D", Cork: "T12", Galway: "H91", Limerick: "V94",
  Stockholm: "1", Göteborg: "4", Malmö: "2", Uppsala: "75",
};
const INWARD = "ABDEFGHJLNPQRSTUWXYZ";

function postcode(rng: Rng, country: Country, city: string): string {
  const p = PREFIX[city] ?? "";
  switch (country) {
    case "GB": {
      const out = rng.pick(GB_AREAS[city]) + String(1 + rng.int(rng.chance(0.3) ? 20 : 9));
      return `${out} ${rng.int(10)}${rng.pick([...INWARD])}${rng.pick([...INWARD])}`;
    }
    case "US":
      return p + rng.digits(2);
    case "DE":
      return p + rng.digits(5 - p.length);
    case "FR":
      return p + rng.digits(5 - p.length);
    case "NL":
      return `${p}${rng.digits(2)} ${rng.pick([..."ABCDEGHJKLMNPRSTVWXZ"])}${rng.pick([..."ABCDEGHJKLMNPRSTVWXZ"])}`;
    case "ES":
      return p + rng.digits(3);
    case "IE":
      return (p === "D" ? "D" + pad2(1 + rng.int(24)) : p) + " " + rng.pick([..."ACDEFHKNPRTVWXY"]) + rng.digits(2) + rng.pick([..."ACDEFHKNPRTVWXY0123456789"]);
    case "SE": {
      const z = (p + rng.digits(5)).slice(0, 5);
      return `${z.slice(0, 3)} ${z.slice(3)}`;
    }
  }
}

function makeAddress(rng: Rng, country: Country): Address {
  const pl = PLACES[country];
  const city = rng.zipf(pl.cities, 0.9);
  return {
    number: String(1 + rng.int(rng.chance(0.8) ? 60 : 240)) + (rng.chance(0.04) ? rng.pick(["a", "b"]) : ""),
    street: rng.pick(pl.streets),
    kind: rng.pick(pl.kinds),
    city: city.name,
    postcode: postcode(rng, country, city.name),
    country,
  };
}

function makePhone(rng: Rng, country: Country, mobile: boolean, area?: string): Phone {
  switch (country) {
    case "GB":
      if (mobile) return { country, area: "7" + rng.pick(["4", "5", "7", "8", "9"]) + rng.digits(2), rest: rng.digits(6), mobile };
      return { country, area: area!, rest: rng.range(2, 9) + rng.digits(10 - area!.length - 1), mobile };
    case "US":
      return { country, area: area!, rest: rng.range(2, 9) + rng.digits(6), mobile };
    case "DE":
      if (mobile) return { country, area: "15" + rng.pick(["1", "2", "7"]), rest: rng.digits(8), mobile };
      return { country, area: area!, rest: rng.range(2, 9) + rng.digits(area!.length >= 3 ? 6 : 7), mobile };
    case "FR":
      if (mobile) return { country, area: rng.pick(["6", "7"]), rest: rng.digits(8), mobile };
      return { country, area: area!, rest: rng.digits(8), mobile };
    case "NL":
      if (mobile) return { country, area: "6", rest: rng.range(1, 9) + rng.digits(7), mobile };
      return { country, area: area!, rest: rng.range(2, 9) + rng.digits(6), mobile };
    case "ES":
      if (mobile) return { country, area: "6" + rng.int(10), rest: rng.digits(7), mobile };
      return { country, area: area!, rest: rng.digits(7), mobile };
    case "IE":
      if (mobile) return { country, area: "8" + rng.pick(["3", "5", "6", "7", "9"]), rest: rng.digits(7), mobile };
      return { country, area: area!, rest: rng.range(2, 9) + rng.digits(area === "1" ? 6 : 5), mobile };
    case "SE":
      if (mobile) return { country, area: "7" + rng.pick(["0", "2", "3", "6"]), rest: rng.digits(7), mobile };
      return { country, area: area!, rest: rng.range(1, 9) + rng.digits(area === "8" ? 6 : 5), mobile };
  }
}

const CC: Record<Country, string> = { GB: "44", US: "1", DE: "49", FR: "33", NL: "31", ES: "34", IE: "353", SE: "46" };
const groups = (s: string, sizes: number[], sep = " ") => {
  const out: string[] = [];
  let i = 0;
  for (const n of sizes) {
    if (i >= s.length) break;
    out.push(s.slice(i, i + n));
    i += n;
  }
  if (i < s.length) out[out.length - 1] += s.slice(i);
  return out.join(sep);
};

/** A phone number written the way someone in that country, or a system, would write it. */
function formatPhone(rng: Rng, p: Phone, style: "national" | "intl"): string {
  const nsn = p.area + p.rest;
  const cc = CC[p.country];
  if (style === "intl") {
    const v = rng.int(6);
    const spaced = p.country === "US" ? `${p.area} ${p.rest.slice(0, 3)} ${p.rest.slice(3)}` : p.country === "FR" ? `${p.area} ${groups(p.rest, [2, 2, 2, 2])}` : `${p.area} ${groups(p.rest, [3, 4])}`;
    if (v === 0) return `+${cc}${nsn}`;
    if (v === 1 && p.country !== "US" && p.country !== "ES") return `+${cc} (0)${spaced}`;
    if (v === 2) return `00${cc} ${spaced}`;
    if (v === 3 && p.country === "US") return `+1-${p.area}-${p.rest.slice(0, 3)}-${p.rest.slice(3)}`;
    return `+${cc} ${spaced}`;
  }
  switch (p.country) {
    case "GB":
      return p.mobile ? `0${p.area}${rng.chance(0.7) ? " " : ""}${p.rest}` : p.area.length === 2 ? `0${p.area} ${groups(p.rest, [4, 4])}` : `0${p.area} ${groups(p.rest, [3, 4])}`;
    case "US": {
      const a = p.area;
      const r = p.rest;
      return rng.pick([`(${a}) ${r.slice(0, 3)}-${r.slice(3)}`, `${a}-${r.slice(0, 3)}-${r.slice(3)}`, `${a}.${r.slice(0, 3)}.${r.slice(3)}`, `1-${a}-${r.slice(0, 3)}-${r.slice(3)}`]);
    }
    case "DE":
      return rng.chance(0.3) ? `0${p.area}/${p.rest}` : `0${p.area} ${p.rest}`;
    case "FR":
      return rng.chance(0.3) ? `0${p.area}.${groups(p.rest, [2, 2, 2, 2], ".")}` : `0${p.area} ${groups(p.rest, [2, 2, 2, 2])}`;
    case "NL":
      return `0${p.area}-${p.rest}`;
    case "ES":
      return groups(nsn, [3, 3, 3]);
    case "IE":
      return p.mobile ? `0${p.area} ${groups(p.rest, [3, 4])}` : rng.chance(0.5) ? `(0${p.area}) ${groups(p.rest, [3, 4])}` : `0${p.area} ${groups(p.rest, [3, 4])}`;
    case "SE":
      return `0${p.area}-${groups(p.rest, [3, 2, 2])}`;
  }
}

// ------------------------------------------------------------------ companies and people

function makeCompanies(rng: Rng, n: number): Company[] {
  const used = new Set<string>();
  const out: Company[] = [];
  while (out.length < n) {
    const a = rng.pick(COINED);
    const base = rng.chance(0.18) ? `${a} & ${rng.pick(COINED)}` : `${a} ${rng.pick(INDUSTRY)}`;
    if (used.has(base)) continue;
    used.add(base);
    const country = COUNTRIES[rng.weighted(COUNTRY_WEIGHTS)];
    const groupsFor = LEGAL[country];
    const address = makeAddress(rng, country);
    const city = PLACES[country].cities.find((c) => c.name === address.city)!;
    out.push({
      base,
      suffixGroup: groupsFor[rng.weighted(groupsFor.map((_, i) => (i === 0 ? 4 : 1)))],
      country,
      domain: base.toLowerCase().replace(/&/g, "and").replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") + ".example",
      address,
      switchboard: makePhone(rng, country, false, city.area),
    });
  }
  return out;
}

/** Every address is unique: a second Sanne van Dijk at the same provider gets digits, as she would in life. */
const usedEmails = new Set<string>();
function emailFor(rng: Rng, first: string, last: string, domain: string, personal: boolean): string {
  const f = mailLocal(first);
  const l = mailLocal(last);
  const pat = personal ? rng.int(5) : rng.int(4);
  let local = [`${f}.${l}`, `${f[0]}${l}`, `${f}${l[0]}`, `${f}_${l}`, `${f}.${l}${rng.range(60, 99)}`][pat];
  while (usedEmails.has(`${local}@${domain}`)) local += rng.int(10);
  usedEmails.add(`${local}@${domain}`);
  return `${local}@${domain}`;
}

function surname(rng: Rng, country: Country): string {
  if (rng.chance(0.2)) return rng.zipf(LAST[country], 0.5);
  const parts = SURNAME_PARTS[country];
  const particle = parts.particles ? rng.pick(parts.particles) : "";
  return particle + rng.pick(parts.pre) + rng.pick(parts.post);
}

function makePeople(rng: Rng, n: number): Person[] {
  const companies = makeCompanies(rng, Math.round(n / 5.5));
  const people: Person[] = [];
  for (let i = 0; i < n; i++) {
    let country: Country;
    let company: Company | null = null;
    let address: Address;
    let home: Phone | null = null;
    let first: string;
    let last: string;
    const household = people.length > 10 && rng.chance(0.06) ? people[people.length - 1 - rng.int(Math.min(10, people.length))] : null;
    if (household) {
      // a partner or relative: same home, often the same family name and landline
      country = household.country;
      address = household.address;
      last = rng.chance(0.75) ? household.last : surname(rng, country);
      home = household.home;
      first = rng.zipf(FIRST[country], 0.4);
      if (first === household.first) first = rng.pick(FIRST[country]);
    } else {
      if (rng.chance(0.55)) {
        company = rng.zipf(companies, 0.5);
        country = rng.chance(0.85) ? company.country : COUNTRIES[rng.weighted(COUNTRY_WEIGHTS)];
      } else country = COUNTRIES[rng.weighted(COUNTRY_WEIGHTS)];
      address = makeAddress(rng, country);
      first = rng.zipf(FIRST[country], 0.4);
      last = surname(rng, country);
      const city = PLACES[country].cities.find((c) => c.name === address.city)!;
      if (rng.chance(0.4)) home = makePhone(rng, country, false, city.area);
    }
    const birth = Date.UTC(1952, 0, 1) + rng.int(52 * 365) * DAY;
    const created = Date.UTC(2014, 0, 1) + rng.int(11 * 365) * DAY;
    const updated = Math.min(TODAY, created + rng.int(5 * 365) * DAY);
    const balance = rng.chance(0.08) ? 0 : Math.round(Math.exp(5 + rng.next() * 4.2) * 100) / 100;
    const personalEmail = rng.chance(company ? 0.6 : 0.95) ? emailFor(rng, first, last, rng.pick(MAIL_PROVIDERS), true) : null;
    const workEmail = company ? emailFor(rng, first, last, company.domain, false) : null;
    people.push({
      key: `E${String(i + 1).padStart(5, "0")}`,
      country,
      first,
      last,
      dob: iso(birth),
      company,
      workEmail,
      personalEmail: personalEmail ?? (workEmail ? null : emailFor(rng, first, last, rng.pick(MAIL_PROVIDERS), true)),
      oldEmail: rng.chance(0.08) ? emailFor(rng, first, last, rng.pick(MAIL_PROVIDERS), true) : null,
      mobile: makePhone(rng, country, true, PLACES[country].cities.find((c) => c.name === address.city)!.area),
      home,
      address,
      oldAddress: rng.chance(0.06) ? makeAddress(rng, country) : null,
      created,
      updated,
      balance,
    });
  }
  return people;
}

// ------------------------------------------------------------------ per-record corruption

type SourceKey = "crm" | "billing" | "support";

interface Variant {
  first: string;
  last: string;
  swapped: boolean;
}

function nameVariant(rng: Rng, p: Person, src: SourceKey): Variant {
  let first = p.first;
  let last = p.last;
  const nick = NICKNAMES[first];
  if (nick && rng.chance(src === "support" ? 0.22 : src === "crm" ? 0.07 : 0.05)) first = rng.pick(nick);
  if (rng.chance(src === "support" ? 0.06 : 0.03)) first = typo(rng, first);
  if (rng.chance(src === "support" ? 0.06 : 0.035)) last = typo(rng, last);
  const strip = src === "billing" ? 0.7 : src === "support" ? 0.5 : 0.08;
  if (rng.chance(strip)) {
    const german = p.country === "DE" && rng.chance(0.5);
    first = stripMarks(first, german);
    last = stripMarks(last, german);
  }
  const swapped = rng.chance(src === "crm" ? 0.012 : 0);
  return swapped ? { first: last, last: first, swapped } : { first, last, swapped };
}

const ABBR: Record<string, string[]> = { Street: ["St", "St."], Road: ["Rd", "Rd."], Avenue: ["Ave", "Ave.", "Av."], Lane: ["Ln"], Drive: ["Dr", "Dr."], Boulevard: ["Blvd"], Close: ["Cl"], Terrace: ["Terr"], straße: ["str.", "strasse"] };

function streetText(rng: Rng, a: Address, abbreviate: number): string {
  let kind = a.kind;
  if (kind && ABBR[kind] && rng.chance(abbreviate)) kind = rng.pick(ABBR[kind]);
  const pl = PLACES[a.country];
  if (a.country === "FR") return `${a.number}${rng.chance(0.3) ? "," : ""} ${a.street}`;
  if (a.country === "ES") return `${a.street}${rng.chance(0.5) ? "," : ""} ${a.number}`;
  if (pl.order === "number-last") return `${a.street}${kind} ${a.number}`;
  const flat = rng.chance(0.05) ? `Flat ${1 + rng.int(12)}, ` : "";
  return `${flat}${a.number} ${a.street} ${kind}`.trim();
}

function companyText(rng: Rng, c: Company): string {
  let base = c.base;
  if (base.includes(" & ") && rng.chance(0.25)) base = base.replace(" & ", " and ");
  if (rng.chance(0.18)) return base;
  return `${base} ${rng.pick(c.suffixGroup)}`;
}

function moneyText(rng: Rng, amount: number, country: Country): string {
  const fixed = amount.toFixed(2);
  const [int, dec] = fixed.split(".");
  const thousands = (sep: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  switch (country) {
    case "GB":
      return rng.chance(0.85) ? `£${thousands(",")}.${dec}` : `GBP ${fixed}`;
    case "US":
      return rng.chance(0.85) ? `$${thousands(",")}.${dec}` : `USD ${fixed}`;
    case "IE":
      return `€${thousands(",")}.${dec}`;
    case "FR":
      return `${thousands(" ")},${dec} €`;
    case "SE":
      return rng.chance(0.5) ? `${thousands(" ")} kr` : `${thousands(" ")},${dec} kr`;
    default:
      return rng.chance(0.8) ? `${thousands(".")},${dec} €` : `EUR ${fixed}`;
  }
}

/** A card number that passes Luhn, on a common network prefix. */
function cardNumber(rng: Rng): string {
  const prefix = rng.pick(["4", "4", "51", "53", "55", "2221", "37"]);
  const len = prefix === "37" ? 15 : 16;
  const body = prefix + rng.digits(len - prefix.length - 1);
  return body + luhnCheckDigit(body);
}

function cardText(rng: Rng, digits: string): string {
  if (digits.length === 15) return rng.chance(0.5) ? digits : `${digits.slice(0, 4)} ${digits.slice(4, 10)} ${digits.slice(10)}`;
  const sep = rng.pick([" ", " ", "-", ""]);
  return sep ? digits.replace(/(\d{4})(?=\d)/g, `$1${sep}`) : digits;
}

const IBAN_FORMAT: Partial<Record<Country, (rng: Rng) => string>> = {
  GB: (rng) => rng.pick(["LOYD", "BARC", "MIDL", "NWBK"]) + rng.digits(14),
  DE: (rng) => rng.digits(18),
  FR: (rng) => rng.digits(10) + rng.digits(11) + rng.digits(2),
  NL: (rng) => rng.pick(["ABNA", "INGB", "RABO", "TRIO"]) + rng.digits(10),
  ES: (rng) => rng.digits(20),
  IE: (rng) => rng.pick(["AIBK", "BOFI"]) + rng.digits(14),
  SE: (rng) => rng.digits(20),
};

function iban(rng: Rng, country: Country, valid = true): string {
  const c = country === "US" ? "GB" : country;
  const bban = IBAN_FORMAT[c]!(rng);
  let check = ibanCheckDigits(c, bban);
  if (!valid) check = pad2((Number(check) + 1 + rng.int(50)) % 97 || 3);
  const raw = c + check + bban;
  return rng.chance(0.7) ? formatIban(raw) : raw;
}

// ------------------------------------------------------------------ notes with PII

class Note {
  text = "";
  spans: { type: PiiType; start: number; end: number; value: string }[] = [];
  add(s: string): this {
    this.text += s;
    return this;
  }
  pii(type: PiiType, value: string): this {
    this.spans.push({ type, start: this.text.length, end: this.text.length + value.length, value });
    this.text += value;
    return this;
  }
}

function dobText(dob: string, style: "dmy" | "iso" | "long"): string {
  const [y, m, d] = dob.split("-");
  if (style === "iso") return dob;
  if (style === "dmy") return `${d}/${m}/${y}`;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

function decoyNumber(rng: Rng): string {
  // 16 digits that fail Luhn: an order or tracking number, not a card
  const body = rng.pick(["4", "5"]) + rng.digits(14);
  const good = luhnCheckDigit(body);
  let bad = String((Number(good) + 1 + rng.int(8)) % 10);
  if (luhn(body + bad)) bad = String((Number(bad) + 1) % 10);
  return body + bad;
}

function makeNote(rng: Rng, p: Person, src: SourceKey): Note | null {
  const n = new Note();
  const phoneFmt = () => formatPhone(rng, rng.chance(0.7) ? p.mobile : p.home ?? p.mobile, rng.chance(0.5) ? "intl" : "national");
  const otherEmail = () => p.oldEmail ?? p.personalEmail ?? p.workEmail ?? emailFor(rng, p.first, p.last, rng.pick(MAIL_PROVIDERS), true);
  const t = rng.int(src === "billing" ? 9 : 12);
  if (src === "crm") {
    switch (t) {
      case 0:
        return n.add("Prefers email. Alt address ").pii("email", otherEmail()).add(".");
      case 1:
        return n.add("Called ").pii("phone", phoneFmt()).add(" re renewal; left voicemail.");
      case 2:
        return n.add("Customer read out card ").pii("card", cardText(rng, cardNumber(rng))).add(" on the phone; told them not to. Flagged.");
      case 3:
        return n.add("Refund to IBAN ").pii("iban", iban(rng, p.country)).add(" approved by finance.");
      case 4:
        return n.add("Verified identity, DOB ").pii("dob", dobText(p.dob, "dmy")).add(".");
      case 5:
        return n.add(`Order #${decoyNumber(rng)} shipped; tracking to follow.`);
      case 6:
        return n.add(`Said "call me ${p.first.split(" ")[0]}"; prefers mornings; budget approx ${rng.range(2, 40)}k.`);
      case 7:
        return n.add(`Invoice INV-${rng.digits(6)} disputed; see ticket ${rng.digits(5)}.\nResolved after credit note.`);
      case 8:
        return n.add("Do not call before 10:00; office line ").pii("phone", phoneFmt()).add(".");
      case 9:
        return n.add(`Met at trade show; interested in ${rng.pick(PLANS)} plan for ${rng.range(3, 60)} seats.`);
      case 10:
        return n.add(`Renewal due ${iso(TODAY + rng.int(200) * DAY)}; send quote.`);
      default:
        return null;
    }
  }
  if (src === "billing") {
    switch (t) {
      case 0:
        return n.add("Direct debit mandate from ").pii("iban", iban(rng, p.country)).add(".");
      case 1:
        return n.add("Card ").pii("card", cardText(rng, cardNumber(rng))).add(" declined twice; customer to update.");
      case 2:
        return n.add(`Card ending ${rng.digits(4)}, expires ${pad2(1 + rng.int(12))}/${rng.range(26, 31)}.`);
      case 3:
        return n.add(`Old IBAN ${iban(rng, p.country, false)} rejected by bank; new one on file.`);
      case 4:
        return n.add("Payer email ").pii("email", otherEmail()).add(" differs from account email.");
      case 5:
        return n.add("Contact accounts payable on ").pii("phone", phoneFmt()).add(".");
      case 6:
        return n.add(`Paid by bank transfer, ref ${rng.digits(10)}.`);
      default:
        return null;
    }
  }
  switch (t) {
    case 0:
      return n.add("Customer called from ").pii("phone", phoneFmt()).add(" about a login issue.");
    case 1:
      return n.add("Asked to send the invoice copy to ").pii("email", otherEmail()).add(" instead.");
    case 2:
      return n.add("Confirmed DOB ").pii("dob", dobText(p.dob, rng.chance(0.5) ? "dmy" : "iso")).add(" for account verification.");
    case 3:
      return n.add("Pasted full card number ").pii("card", cardText(rng, cardNumber(rng))).add(" in chat; removed from ticket view.");
    case 4:
      return n.add(`Firmware ${rng.range(2, 4)}.${rng.range(0, 14)}.${rng.range(0, 9)} crashes on startup; escalated.`);
    case 5:
      return n.add(`Order ${decoyNumber(rng)} arrived damaged, photo attached.`);
    case 6:
      return n.add("Born ").pii("dob", dobText(p.dob, "long")).add(", asked about the loyalty discount.");
    case 7:
      return n.add("Callback requested on ").pii("phone", phoneFmt()).add(" after 3pm.");
    case 8:
      return n.add(`Ticket merged with #${rng.digits(5)}; renewal date ${iso(TODAY + rng.int(300) * DAY)} confirmed.`);
    default:
      return null;
  }
}

// ------------------------------------------------------------------ sources

const CRM_COLUMNS = ["Contact ID", "First Name", "Last Name", "E-mail", "Mobile", "Company", "Street", "Town", "Post Code", "Country", "Birthday", "Created", "Last Modified", "Annual Value", "Lead Source", "Owner", "Notes"];
const CRM_MAP: (FieldKey | null)[] = ["source_id", "first_name", "last_name", "email", "phone", "company", "street", "city", "postcode", "country", "date_of_birth", "created_at", "updated_at", "balance", null, null, "notes"];
const SUPPORT_COLUMNS = ["Requester ID", "Requester", "Requester Email", "Phone #", "Organization", "City", "Country Code", "First Contact", "Last Activity", "Tickets", "Satisfaction", "Last Note"];
const SUPPORT_MAP: (FieldKey | null)[] = ["source_id", "full_name", "email", "phone", "company", "city", "country", "created_at", "updated_at", null, null, "notes"];

/**
 * Header spellings real exports use. Each seed draws one per column from its
 * own stream, so the mapping is scored on headers it was not written against;
 * some (ARR, Ctry, Region, Joined, Summary) are in no synonym list on purpose.
 */
const HEADER_VARIANTS: Record<string, string[]> = {
  "Contact ID": ["Contact ID", "ContactId", "Cust. Ref", "Record ID", "CRM ID"],
  "First Name": ["First Name", "Firstname", "Given Name", "FNAME", "first_name"],
  "Last Name": ["Last Name", "Surname", "Family Name", "LNAME", "last_name"],
  "E-mail": ["E-mail", "Email Address", "Mail", "Primary Email", "email_addr"],
  Mobile: ["Mobile", "Phone", "Cell", "Tel.", "Contact Number"],
  Company: ["Company", "Account Name", "Organisation", "Employer", "Business Name"],
  Street: ["Street", "Address Line 1", "Addr1", "Street Address", "Address"],
  Town: ["Town", "City", "Town/City", "Locality"],
  "Post Code": ["Post Code", "Postal Code", "ZIP", "Zip/Postcode", "PLZ"],
  Country: ["Country", "Country Name", "Ctry", "Nation"],
  Birthday: ["Birthday", "DOB", "Date of Birth", "Birth Date", "D.O.B."],
  Created: ["Created", "Created On", "Customer Since", "Date Added", "Signup Date"],
  "Last Modified": ["Last Modified", "Modified On", "Updated", "Last Updated", "Changed"],
  "Annual Value": ["Annual Value", "Account Value", "Revenue", "ARR", "Lifetime Value"],
  "Lead Source": ["Lead Source", "Source", "Channel", "Campaign"],
  Owner: ["Owner", "Account Manager", "Rep", "Assigned To"],
  Notes: ["Notes", "Comments", "Description", "Remarks", "Internal Notes"],
  "Requester ID": ["Requester ID", "User ID", "Contact Id", "Customer #"],
  Requester: ["Requester", "Name", "Contact Name", "Customer Name", "Full Name"],
  "Requester Email": ["Requester Email", "Email", "E-mail Address", "Contact Email"],
  "Phone #": ["Phone #", "Phone Number", "Tel", "Callback Number"],
  Organization: ["Organization", "Org", "Company", "Account"],
  City: ["City", "Location", "Town"],
  "Country Code": ["Country Code", "Country", "Region"],
  "First Contact": ["First Contact", "First Seen", "Created At", "Joined"],
  "Last Activity": ["Last Activity", "Last Seen", "Updated At", "Last Reply"],
  Tickets: ["Tickets", "Open Tickets", "Ticket Count"],
  Satisfaction: ["Satisfaction", "CSAT", "NPS"],
  "Last Note": ["Last Note", "Latest Comment", "Notes", "Summary"],
};

function pickHeaders(rng: Rng, columns: string[]): string[] {
  const used = new Set<string>();
  return columns.map((c) => {
    let h = rng.pick(HEADER_VARIANTS[c] ?? [c]);
    if (used.has(h)) h = c;
    used.add(h);
    return h;
  });
}
const BILLING_MAP: Record<string, FieldKey | null> = {
  account_no: "source_id",
  "holder.name.given": "first_name",
  "holder.name.family": "last_name",
  "holder.email": "email",
  "holder.tel": "phone",
  "holder.birth_date": "date_of_birth",
  organisation: "company",
  "address.line1": "street",
  "address.city": "city",
  "address.zip": "postcode",
  "address.country": "country",
  opened: "created_at",
  updated_at: "updated_at",
  "balance.amount": "balance",
  "balance.currency": "currency",
  plan: null,
  seats: null,
  tags: null,
  memo: "notes",
};

const dmy = (t: number) => {
  const d = new Date(t);
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};
const mdyShort = (t: number) => {
  const d = new Date(t);
  return `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}-${String(d.getUTCFullYear()).slice(2)}`;
};

interface Row {
  entity: string;
  cells: Record<string, string>;
  note: Note | null;
  sortKey: number;
}

function crmRow(rng: Rng, p: Person): Row {
  const v = nameVariant(rng, p, "crm");
  const caps = rng.chance(0.01);
  const ws = (s: string) => (rng.chance(0.02) ? ` ${s} ` : s);
  const email = rng.chance(0.86) ? ((rng.chance(0.7) ? p.workEmail : p.personalEmail) ?? p.personalEmail ?? p.workEmail ?? "") : "";
  const emailCased = email && rng.chance(0.25) ? email.replace(/(^|[.@-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()) : email;
  const usesWork = p.company && rng.chance(0.3);
  const phone = rng.chance(0.85) ? formatPhone(rng, usesWork ? p.company!.switchboard : p.mobile, rng.chance(0.7) ? "national" : "intl") : "";
  const addr = usesWork ? p.company!.address : p.oldAddress && rng.chance(0.5) ? p.oldAddress : p.address;
  let dob = rng.chance(0.55) ? dmy(Date.parse(p.dob)) : "";
  if (dob && rng.chance(0.03)) {
    const [d, m, y] = dob.split("/");
    if (Number(d) <= 12) dob = `${m}/${d}/${y}`; // keyed in US order by someone
  }
  const note = rng.chance(0.4) ? makeNote(rng, p, "crm") : null;
  const created = p.created + rng.int(30) * DAY;
  return {
    entity: p.key,
    sortKey: rng.next(),
    note,
    cells: {
      "First Name": ws(caps ? v.first.toUpperCase() : v.first),
      "Last Name": caps ? v.last.toUpperCase() : v.last,
      "E-mail": emailCased,
      Mobile: phone,
      Company: p.company && rng.chance(0.92) ? companyText(rng, p.company) : "",
      Street: rng.chance(0.88) ? streetText(rng, addr, 0.4) : "",
      Town: rng.chance(0.95) ? addr.city : "",
      "Post Code": rng.chance(0.9) ? (rng.chance(0.15) ? addr.postcode.replace(" ", "").toLowerCase() : addr.postcode) : "",
      Country: rng.chance(0.93) ? rng.pick(COUNTRY_SPELLINGS[addr.country]) : rng.pick(["", "N/A"]),
      Birthday: dob,
      Created: dmy(created),
      "Last Modified": dmy(Math.max(created, p.updated - rng.int(200) * DAY)),
      "Annual Value": rng.chance(0.8) ? moneyText(rng, p.balance * (0.8 + rng.next() * 0.6), addr.country) : "",
      "Lead Source": rng.pick(LEAD_SOURCES),
      Owner: rng.pick(STAFF),
      Notes: note?.text ?? "",
    },
  };
}

function billingRecord(rng: Rng, p: Person, accountNo: string): { entity: string; obj: Record<string, unknown>; note: Note | null; sortKey: number } {
  const v = nameVariant(rng, p, "billing");
  const caps = rng.chance(0.25);
  const up = (s: string) => (caps ? s.toUpperCase() : s);
  let email = (rng.chance(0.5) ? p.personalEmail : p.workEmail) ?? p.personalEmail ?? p.workEmail ?? "";
  if (email && rng.chance(0.22)) email = email.replace("@", `+${rng.pick(["billing", "invoices", "acct", "pay"])}@`);
  if (rng.chance(0.08)) email = "";
  const phone = rng.chance(0.88) ? formatPhone(rng, rng.chance(0.5) ? p.mobile : p.home ?? p.company?.switchboard ?? p.mobile, rng.chance(0.75) ? "intl" : "national") : "";
  const addr = p.oldAddress && rng.chance(0.3) ? p.oldAddress : p.address;
  const opened = p.created + rng.int(60) * DAY;
  const openedText = rng.chance(0.8) ? Math.floor(opened / 1000) : rng.chance(0.5) ? String(opened) : iso(opened);
  const updated = Math.max(opened, p.updated - rng.int(90) * DAY) + rng.int(86400) * 1000;
  const amountStyle = rng.int(10);
  const amount = Math.round(p.balance * (rng.chance(0.1) ? -0.1 : 1) * 100) / 100;
  const note = rng.chance(0.35) ? makeNote(rng, p, "billing") : null;
  const holder: Record<string, unknown> = { name: { given: up(v.first), family: up(v.last) }, email, tel: phone };
  if (rng.chance(0.45)) holder.birth_date = p.dob;
  else if (rng.chance(0.3)) holder.birth_date = null;
  const obj: Record<string, unknown> = {
    account_no: accountNo,
    holder,
    organisation: p.company && rng.chance(0.75) ? up(companyText(rng, p.company)) : null,
    address: {
      line1: rng.chance(0.92) ? up(streetText(rng, addr, 0.3)) : "",
      city: up(stripMarks(addr.city)),
      zip: addr.postcode,
      country: addr.country,
    },
    opened: openedText,
    updated_at: new Date(updated).toISOString().replace(/\.\d{3}Z$/, "Z"),
    balance: { amount: amountStyle < 6 ? amount : amountStyle < 9 ? amount.toFixed(2) : amount.toFixed(2).replace(".", ","), currency: CURRENCY[addr.country] },
    plan: rng.pick(PLANS),
    seats: 1 + rng.int(40),
  };
  if (rng.chance(0.4)) obj.tags = Array.from({ length: 1 + rng.int(3) }, () => rng.pick(TAGS));
  if (note) obj.memo = note.text;
  return { entity: p.key, obj, note, sortKey: Number(accountNo.slice(3)) };
}

function supportRow(rng: Rng, p: Person): Row {
  const v = nameVariant(rng, p, "support");
  const form = rng.next();
  let name: string;
  if (form < 0.14) name = `${v.last}, ${v.first}`;
  else if (form < 0.18) name = `${v.last} ${v.first}`; // swapped, no comma
  else if (form < 0.23) name = `${v.first} ${v.first[0] === "A" ? "B" : "A"}. ${v.last}`; // middle initial
  else if (form < 0.25) name = `Dr. ${v.first} ${v.last}`;
  else name = `${v.first} ${v.last}`;
  if (rng.chance(0.07)) name = name.toLowerCase();
  const email = rng.chance(0.93) ? (rng.chance(0.15) && p.oldEmail ? p.oldEmail : ((rng.chance(0.55) ? p.personalEmail : p.workEmail) ?? p.personalEmail ?? p.workEmail ?? "")) : "";
  const phone = rng.chance(0.6) ? formatPhone(rng, rng.chance(0.8) ? p.mobile : p.home ?? p.mobile, rng.chance(0.5) ? "intl" : "national") : "";
  const city = rng.chance(0.75) ? (rng.chance(0.4) ? stripMarks(p.address.city) : p.address.city) : "";
  const first = p.created + (30 + rng.int(700)) * DAY;
  const last = Math.min(TODAY, first + rng.int(900) * DAY);
  const note = rng.chance(0.55) ? makeNote(rng, p, "support") : null;
  const lastDate = new Date(last + rng.int(86400) * 1000);
  return {
    entity: p.key,
    sortKey: first,
    note,
    cells: {
      Requester: name,
      "Requester Email": email,
      "Phone #": phone,
      Organization: p.company && rng.chance(0.6) ? companyText(rng, p.company) : "",
      City: city,
      "Country Code": rng.chance(0.8) ? p.address.country : rng.pick(COUNTRY_SPELLINGS[p.address.country]),
      "First Contact": mdyShort(first),
      "Last Activity": `${lastDate.toISOString().slice(0, 10)} ${lastDate.toISOString().slice(11, 16)}`,
      Tickets: String(1 + rng.int(rng.chance(0.2) ? 40 : 6)),
      Satisfaction: rng.pick(["5", "4", "4.5", "3", "good", "", "2"]),
      "Last Note": note?.text ?? "",
    },
  };
}

// ------------------------------------------------------------------ assembly

export function generate(seed = DEFAULT_SEED, customers = DEFAULT_CUSTOMERS): Generated {
  const rng = new Rng(seed);
  usedEmails.clear();
  const people = makePeople(rng, customers);

  const crm: Row[] = [];
  const billing: ReturnType<typeof billingRecord>[] = [];
  const support: Row[] = [];
  let acct = 104000;
  for (const p of people) {
    let inCrm = rng.chance(0.88);
    const inBilling = rng.chance(0.78);
    const inSupport = rng.chance(0.72);
    if (!inCrm && !inBilling && !inSupport) inCrm = true;
    if (inCrm) {
      crm.push(crmRow(rng, p));
      if (rng.chance(0.06)) crm.push(crmRow(rng, p));
    }
    if (inBilling) {
      billing.push(billingRecord(rng, p, `BL-${acct++ + rng.int(7)}`));
      acct += rng.int(9);
      if (rng.chance(0.04)) billing.push(billingRecord(rng, p, `BL-${acct++ + rng.int(7)}`));
    }
    if (inSupport) {
      support.push(supportRow(rng, p));
      if (rng.chance(0.14)) support.push(supportRow(rng, p));
      if (rng.chance(0.02)) support.push(supportRow(rng, p));
    }
  }

  // junk: test rows and spam that a contract should quarantine
  for (let j = 0; j < 7; j++) {
    const fake = people[rng.int(people.length)];
    const r = crmRow(rng, fake);
    r.entity = `junk-crm-${j}`;
    r.cells["First Name"] = rng.pick(["Test", "test", "DO NOT USE", "Dummy", "asdf"]);
    r.cells["Last Name"] = rng.pick(["Contact", "Test", "Account", "asdf", "User"]);
    r.cells["E-mail"] = rng.chance(0.5) ? `test${rng.digits(3)}@${rng.pick(MAIL_PROVIDERS)}` : "";
    r.cells.Mobile = "";
    r.cells.Notes = "";
    r.note = null;
    crm.push(r);
  }
  for (let j = 0; j < 12; j++) {
    support.push({
      entity: `junk-support-${j}`,
      sortKey: Date.UTC(2023, 0, 1) + rng.int(900) * DAY,
      note: null,
      cells: { Requester: "", "Requester Email": "", "Phone #": "", Organization: "", City: "", "Country Code": "", "First Contact": mdyShort(Date.UTC(2023, 0, 1) + rng.int(900) * DAY), "Last Activity": "", Tickets: "1", Satisfaction: "", "Last Note": rng.pick(["Spam ticket, closed.", "Auto-reply loop", "Out of office reply"]) },
    });
  }

  // CRM: semicolon-delimited, BOM, CRLF, sorted by contact id
  rng.shuffle(crm);
  const crmIds = new Set<string>();
  const crmRows = crm.map((r, i) => {
    let id: string;
    do id = `C-${rng.digits(6)}`;
    while (crmIds.has(id));
    crmIds.add(id);
    r.sortKey = Number(id.slice(2));
    void i;
    return { ...r, id };
  });
  crmRows.sort((a, b) => a.sortKey - b.sortKey);
  // an export bug: two contacts written twice with the same id
  for (let k = 0; k < 2; k++) {
    const dup = crmRows[rng.int(crmRows.length)];
    crmRows.splice(crmRows.indexOf(dup) + 1, 0, { ...dup, note: dup.note });
  }

  billing.sort((a, b) => a.sortKey - b.sortKey);
  support.sort((a, b) => a.sortKey - b.sortKey);
  const supportIds = support.map((_, i) => String(48000 + i * 3 + rng.int(3)));

  const truth: Truth = {
    seed,
    customers,
    entities: { crm: [], billing: [], support: [] },
    mapping: { crm: {}, billing: {}, support: {} },
    pii: [],
  };
  // header spellings come from their own stream, so the data is the same whatever the headers
  const hr = new Rng(`${seed}:headers`);
  const crmHeaders = pickHeaders(hr, CRM_COLUMNS);
  const supportHeaders = pickHeaders(hr, SUPPORT_COLUMNS);
  crmHeaders.forEach((h, i) => (truth.mapping.crm[h] = CRM_MAP[i]));
  supportHeaders.forEach((h, i) => (truth.mapping.support[h] = SUPPORT_MAP[i]));
  truth.mapping.billing = { ...BILLING_MAP };
  const crmNotes = crmHeaders[CRM_COLUMNS.indexOf("Notes")];
  const supportNotes = supportHeaders[SUPPORT_COLUMNS.indexOf("Last Note")];

  const crmTable = [crmHeaders];
  crmRows.forEach((r, i) => {
    crmTable.push(CRM_COLUMNS.map((c) => (c === "Contact ID" ? r.id : r.cells[c] ?? "")));
    truth.entities.crm.push(r.entity);
    if (r.note) for (const s of r.note.spans) truth.pii.push({ source: "crm", row: i, column: crmNotes, ...s });
  });
  const billingLines = billing.map((b, i) => {
    truth.entities.billing.push(b.entity);
    if (b.note) for (const s of b.note.spans) truth.pii.push({ source: "billing", row: i, column: "memo", ...s });
    return JSON.stringify(b.obj);
  });
  const supportTable = [supportHeaders];
  support.forEach((r, i) => {
    supportTable.push(SUPPORT_COLUMNS.map((c) => (c === "Requester ID" ? supportIds[i] : r.cells[c] ?? "")));
    truth.entities.support.push(r.entity);
    if (r.note) for (const s of r.note.spans) truth.pii.push({ source: "support", row: i, column: supportNotes, ...s });
  });

  const files: SourceFile[] = [
    { id: "crm", label: "CRM export", name: "crm_contacts_export.csv", text: toCsv(crmTable, { delimiter: ";", eol: "\r\n", bom: true }) },
    { id: "billing", label: "Billing system", name: "billing_accounts.ndjson", text: billingLines.join("\n") + "\n" },
    { id: "support", label: "Support desk", name: "helpdesk_requesters.csv", text: toCsv(supportTable, { delimiter: ",", eol: "\n" }) },
  ];
  return { seed, files, truth };
}
