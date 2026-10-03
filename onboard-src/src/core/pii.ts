// PII detection in free text: emails, phone numbers, payment cards (Luhn),
// IBANs (ISO 7064 mod 97) and dates of birth (a date next to a birth
// keyword). Detectors run in priority order and never overlap. `validate:
// false` is the regex-only baseline the evaluation compares against.

import { IBAN_LENGTHS, ibanValid, isCardNumber } from "./checks";

export type PiiType = "email" | "phone" | "card" | "iban" | "dob";
export const PII_TYPES: PiiType[] = ["email", "phone", "card", "iban", "dob"];
export const PII_LABEL: Record<PiiType, string> = { email: "Email", phone: "Phone", card: "Card number", iban: "IBAN", dob: "Date of birth" };

export interface PiiSpan {
  type: PiiType;
  start: number;
  end: number;
  value: string;
}

export interface DetectOptions {
  /** Checksums, structure and context checks. Off = regex-only baseline. */
  validate?: boolean;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const IBAN_START = /\b[A-Z]{2}\d{2}(?=[ ]?[A-Z0-9])/g;
const CARD_RE = /(?<![\d+])\d(?:[ -]?\d){12,18}(?!\d)/g;
const PHONE_RE = /(?<![\w+@.\/-])(?:\+\s?|\()?\d[\d \-().\/]{5,20}\d(?![\w@])/g;
/** A number right after "ref", "order #", "invoice no." and the like is an identifier, not a phone. */
const ID_CONTEXT = /\b(?:ref|reference|order|invoice|inv|tracking|ticket|case|po|acct|account|iban|card)\b\.?(?:\s*(?:no\.?|number|nr\.?|#))?\s*[:#]?\s*$/i;
const DATE_RE = /\b(?:\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4})\b/gi;
const DOB_CONTEXT = /(?:\bdob\b|d\.o\.b\.?|date of birth|\bborn\b|birth ?date|birthday|\bgeb\.|\bnée?\b)/i;

function overlaps(taken: PiiSpan[], s: number, e: number): boolean {
  for (const t of taken) if (s < t.end && e > t.start) return true;
  return false;
}

/** Reads up to 34 IBAN characters from `start`, allowing single spaces between groups. */
function ibanAt(text: string, start: number, validate: boolean): { end: number; compact: string } | null {
  let compact = "";
  let i = start;
  const ends: number[] = [];
  while (i < text.length && compact.length < 34) {
    const ch = text[i];
    if (/[A-Z0-9]/.test(ch)) {
      compact += ch;
      ends.push(i + 1);
      i++;
    } else if (ch === " " && /[A-Z0-9]/.test(text[i + 1] ?? "") && compact.length % 4 === 0) i++;
    else break;
  }
  if (!validate) return compact.length >= 15 ? { end: ends[compact.length - 1], compact } : null;
  const len = IBAN_LENGTHS[compact.slice(0, 2)];
  if (!len || compact.length < len) return null;
  const cand = compact.slice(0, len);
  if (!ibanValid(cand)) return null;
  // the IBAN must end at a word boundary, not in the middle of a longer token
  const end = ends[len - 1];
  if (/[A-Za-z0-9]/.test(text[end] ?? "")) return null;
  return { end, compact: cand };
}

function plausiblePhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (/^\d{1,4}[./-]\d{1,2}[./-]\d{2,4}$/.test(raw.trim())) return false; // a date
  if (raw.startsWith("+")) return digits.length >= 8 && digits.length <= 15;
  if (/^00\d/.test(raw)) return digits.length >= 10 && digits.length <= 17;
  if (/^(?:1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]\d{4}$/.test(raw)) return true; // North American, with or without the leading 1
  if (/^\(?0/.test(raw)) return (digits.length >= 9 && digits.length <= 12 && /[ \-().\/]/.test(raw)) || (digits.length >= 10 && digits.length <= 11);
  // national numbers without a trunk 0 (Spain): nine digits grouped the way people write them
  if (/^[6789]\d{2}(?: \d{3} \d{3}| \d{2} \d{2} \d{2})$/.test(raw)) return true;
  return false;
}

export function detectPii(text: string, opts: DetectOptions = {}): PiiSpan[] {
  const validate = opts.validate ?? true;
  if (!text) return [];
  let digits = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 48 && c <= 57) digits++;
  }
  const at = text.includes("@");
  if (!digits && !at) return [];
  const spans: PiiSpan[] = [];
  const add = (type: PiiType, start: number, end: number) => {
    if (overlaps(spans, start, end)) return;
    spans.push({ type, start, end, value: text.slice(start, end) });
  };

  if (at) for (const m of text.matchAll(EMAIL_RE)) add("email", m.index!, m.index! + m[0].length);
  // the rest all need digits: an IBAN at least 15 characters with its check digits, a card 13, a phone 7, a date 4
  if (digits < 4) return spans.sort((a, b) => a.start - b.start);

  if (digits >= 10)
    for (const m of text.matchAll(IBAN_START)) {
      const hit = ibanAt(text, m.index!, validate);
      if (hit) add("iban", m.index!, hit.end);
    }

  if (digits >= 13) for (const m of text.matchAll(CARD_RE)) {
    const digits = m[0].replace(/\D/g, "");
    if (validate) {
      if (!isCardNumber(digits)) continue;
      // cards are written as one run or in groups of 4 (Amex 4-6-5)
      if (/[ -]/.test(m[0]) && !/^\d{4}([ -]\d{4}){2,3}([ -]\d{1,3})?$|^\d{4}[ -]\d{6}[ -]\d{5}$/.test(m[0])) continue;
    }
    add("card", m.index!, m.index! + m[0].length);
  }

  for (const m of text.matchAll(DATE_RE)) {
    const s = m.index!;
    if (validate && !DOB_CONTEXT.test(text.slice(Math.max(0, s - 32), s))) continue;
    add("dob", s, s + m[0].length);
  }

  if (digits >= 7) for (const m of text.matchAll(PHONE_RE)) {
    let raw = m[0];
    let s = m.index!;
    // trim a closing parenthesis or separator that belongs to the sentence
    while (/[ \-.)]$/.test(raw) && !(raw.endsWith(")") && raw.includes("("))) raw = raw.slice(0, -1);
    if (raw.startsWith("(") && !/^\(\d{1,5}\)/.test(raw)) {
      raw = raw.slice(1);
      s++;
    }
    const digits = raw.replace(/\D/g, "");
    if (validate) {
      const before = text.slice(Math.max(0, s - 24), s);
      // not a phone: implausible shape, an identifier's label right before it, or the tail of an IBAN-like account number
      if (!plausiblePhone(raw) || ID_CONTEXT.test(before) || /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4})* ?$/.test(before)) continue;
    } else if (digits.length < 7) continue;
    add("phone", s, s + raw.length);
  }

  return spans.sort((a, b) => a.start - b.start);
}

// ------------------------------------------------------------------ policies

export type PiiAction = "mask" | "token" | "keep";
export type PiiPolicy = Record<PiiType, PiiAction>;
export const DEFAULT_POLICY: PiiPolicy = { email: "token", phone: "mask", card: "mask", iban: "mask", dob: "mask" };

const DOT = "•";

export function mask(type: PiiType, value: string): string {
  switch (type) {
    case "email": {
      const at = value.indexOf("@");
      return at > 0 ? value[0] + DOT.repeat(3) + value.slice(at) : DOT.repeat(value.length);
    }
    case "card": {
      let seen = 0;
      const total = value.replace(/\D/g, "").length;
      return value.replace(/\d/g, (d) => (++seen > total - 4 ? d : DOT));
    }
    case "iban": {
      let seen = 0;
      const total = value.replace(/\s/g, "").length;
      return value.replace(/[A-Z0-9]/g, (c) => (++seen <= 2 || seen > total - 4 ? c : DOT));
    }
    case "phone": {
      let seen = 0;
      const total = value.replace(/\D/g, "").length;
      return value.replace(/\d/g, (d) => (++seen > total - 2 ? d : DOT));
    }
    case "dob":
      return value.replace(/[0-9A-Za-z]/g, DOT);
  }
}

/** What two spellings of the same value have in common, so they get the same token. */
export function tokenSubject(type: PiiType, value: string): string {
  switch (type) {
    case "email":
      return value.trim().toLowerCase();
    case "phone":
    case "card":
      return value.replace(/\D/g, "");
    case "iban":
      return value.replace(/\s/g, "").toUpperCase();
    case "dob":
      return value.trim();
  }
}

const enc = new TextEncoder();

/** Deterministic pseudonyms: HMAC-SHA256(key, type:value), via WebCrypto. Same key and value, same token, in any source. */
export class Tokenizer {
  private key: Promise<CryptoKey>;
  private cache = new Map<string, Promise<string>>();
  constructor(secret: string) {
    this.key = crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  }

  async hmacHex(message: string): Promise<string> {
    const sig = await crypto.subtle.sign("HMAC", await this.key, enc.encode(message));
    return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  token(type: PiiType, value: string): Promise<string> {
    const subject = `${type}:${tokenSubject(type, value)}`;
    let p = this.cache.get(subject);
    if (!p) {
      p = this.hmacHex(subject).then((h) => `${type}_${h.slice(0, 12)}`);
      this.cache.set(subject, p);
    }
    return p;
  }
}

export interface Segment {
  text: string;
  type?: PiiType;
  original?: string;
}

/** Applies a policy to one text and returns it as segments, so a UI can highlight what changed. `tokens` holds precomputed tokens by `type:value`. */
export function redactWith(text: string, spans: PiiSpan[], policy: PiiPolicy, tokens: Map<string, string>): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const s of spans) {
    if (s.start > at) out.push({ text: text.slice(at, s.start) });
    const action = policy[s.type];
    const replaced = action === "keep" ? s.value : action === "mask" ? mask(s.type, s.value) : (tokens.get(`${s.type}:${s.value}`) ?? mask(s.type, s.value));
    out.push({ text: replaced, type: s.type, original: s.value });
    at = s.end;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** Tokens for every span whose type the policy tokenizes, computed concurrently. */
export async function tokenize(spans: Iterable<PiiSpan>, policy: PiiPolicy, tok: Tokenizer): Promise<Map<string, string>> {
  const want = new Map<string, PiiSpan>();
  for (const s of spans) if (policy[s.type] === "token") want.set(`${s.type}:${s.value}`, s);
  const keys = [...want.keys()];
  const values = await Promise.all(keys.map((k) => tok.token(want.get(k)!.type, want.get(k)!.value)));
  return new Map(keys.map((k, i) => [k, values[i]]));
}

export async function redact(text: string, spans: PiiSpan[], policy: PiiPolicy, tok: Tokenizer): Promise<Segment[]> {
  return redactWith(text, spans, policy, await tokenize(spans, policy, tok));
}

export function segmentsToText(segs: Segment[]): string {
  return segs.map((s) => s.text).join("");
}
