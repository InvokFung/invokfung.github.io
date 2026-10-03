// PII redaction, reversible.
//
// Detected values are swapped for typed placeholders (<EMAIL_1>, <CARD_1>, …)
// before anything leaves for the upstream. The mapping lives in a per-request
// Vault in memory only; it is never logged, cached or sent anywhere. On the way
// back, a StreamRestorer swaps placeholders for the originals while the
// response is still streaming, holding back only the few characters that might
// be the start of a placeholder split across chunks ("<EMA" + "IL_1>").
//
// "mask" mode is one-way: values become [EMAIL] and nothing is restored.

export type PiiType = "EMAIL" | "PHONE" | "CARD" | "IBAN" | "NAME";
export const PII_TYPES: readonly PiiType[] = ["EMAIL", "PHONE", "CARD", "IBAN", "NAME"];

export interface Finding {
  type: PiiType;
  start: number;
  end: number;
  value: string;
}

// ------------------------------------------------------------------ detectors

const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9_%+-])?@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}(?![A-Za-z0-9-])/g;

// 13-19 digits, optionally grouped by single spaces or dashes.
const CARD = /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d])/g;

export function luhn(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl && (d *= 2) > 9) d -= 9;
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Issuer prefixes (IIN ranges) and lengths of the major networks. */
function cardNetwork(d: string): string | null {
  const n = d.length;
  const p2 = Number(d.slice(0, 2));
  const p4 = Number(d.slice(0, 4));
  if (d[0] === "4" && (n === 13 || n === 16 || n === 19)) return "visa";
  if (((p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720)) && n === 16) return "mastercard";
  if ((p2 === 34 || p2 === 37) && n === 15) return "amex";
  if ((d.startsWith("6011") || p2 === 65 || (p4 >= 6440 && p4 <= 6499)) && n >= 16) return "discover";
  if (p4 >= 3528 && p4 <= 3589 && n >= 16) return "jcb";
  if ((p2 === 36 || p2 === 38 || (p4 >= 3000 && p4 <= 3059)) && n === 14) return "diners";
  if (p2 === 62 && n >= 16) return "unionpay";
  return null;
}

// Country code, check digits, then BBAN characters with optional single spaces.
const IBAN = /(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?: ?[A-Z0-9]){10,30}/g;
const IBAN_LENGTH: Record<string, number> = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GR: 27, HR: 21,
  HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SE: 24,
  SI: 19, SK: 24, SM: 27, AE: 23, SA: 24, TR: 26, IL: 23, BR: 29, QA: 29,
};

export function ibanValid(iban: string): boolean {
  const s = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    const v = c >= 65 ? String(c - 55) : ch;
    for (const digit of v) rem = (rem * 10 + (digit.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

// International numbers, NANP (415) 555-0132 / 415-555-0132, and European
// national formats starting with 0. Bare digit runs are not phones: too many
// order numbers look like them, and a group in the middle of a longer digit
// sequence (an account number, a malformed IBAN) is not the start of a phone.
const PHONE = new RegExp(
  [
    String.raw`\+\d{1,3}(?:[ .-]?\(\d{1,4}\))?(?:[ .-]?\d{1,5}){2,5}`,
    String.raw`\(\d{3}\)[ .-]?\d{3}[ .-]\d{4}`,
    String.raw`(?<![\d.-]|\d )\d{3}[.-]\d{3}[.-]\d{4}`,
    String.raw`(?<![\d.-]|\d )\d{3} \d{3} \d{4}`,
    String.raw`(?<![\d.-]|\d )0\d{1,4}(?:[ -]\d{2,4}){2,3}`,
    // National numbers written as area/mobile prefix plus one block: UK "07700 900123", "0161 4960123".
    String.raw`(?<![\d.-]|\d )0\d{3,4}[ -]\d{6,7}`,
    String.raw`(?<![\d.-]|\d )0\d{9,10}(?![\d])`,
  ]
    .map((p) => `(?:${p})`)
    .join("|") + String.raw`(?![\d])`,
  "g",
);
const PHONE_VETO = /(?:order|invoice|ticket|case|ref(?:erence)?|tracking|account|acct|po|sku|id|#|no\.?)\s*(?:number|no\.?|#|id)?\s*[:#]?\s*$/i;

// Names: a cue phrase, an honorific or a known first name, followed by
// capitalised words. Names are the weakest detector here, by design of the method.
const FIRST_NAMES = new Set(
  `James John Robert Michael William David Richard Joseph Thomas Charles Daniel Matthew Anthony Mark Paul Steven Andrew Kenneth Joshua Kevin Brian
George Timothy Ronald Edward Jason Jeffrey Ryan Jacob Gary Nicholas Eric Jonathan Stephen Larry Justin Scott Brandon Benjamin Samuel Gregory Alexander
Patrick Frank Raymond Jack Dennis Jerry Tyler Aaron Jose Adam Nathan Henry Peter Zachary Douglas Harold Kyle Noah Ethan Liam Lucas Oliver Elijah Mason
Logan Mary Patricia Jennifer Linda Elizabeth Barbara Susan Jessica Sarah Karen Lisa Nancy Betty Sandra Margaret Ashley Kimberly Emily Donna Michelle
Carol Amanda Melissa Deborah Stephanie Dorothy Rebecca Sharon Laura Cynthia Amy Kathleen Angela Shirley Brenda Emma Anna Pamela Nicole Samantha
Katherine Christine Helen Debra Rachel Carolyn Janet Maria Catherine Heather Diane Olivia Julie Joyce Victoria Ruth Virginia Lauren Kelly Christina
Joan Evelyn Judith Andrea Hannah Megan Cheryl Jacqueline Martha Madison Teresa Gloria Sara Janice Ann Kathryn Abigail Sophia Frances Jean Alice Judy
Isabella Julia Grace Amber Denise Danielle Marilyn Beverly Charlotte Natalie Theresa Diana Brittany Doris Kayla Alexis Lori Marie Mia Ava Chloe Zoe
Priya Raj Arjun Ananya Rohan Aisha Fatima Omar Ahmed Mohammed Ali Hassan Yusuf Leila Wei Li Ming Hui Chen Jun Hiroshi Yuki Kenji Akira Sakura Mei
Ji-woo Min-jun Seo-yeon Carlos Juan Luis Miguel Sofia Lucia Diego Mateo Valentina Camila Pierre Jean-Luc Amelie Lukas Hans Greta Ingrid Sven Lars
Freya Astrid Olga Ivan Dmitri Natasha Anya Kwame Amara Chidi Ngozi Thabo Zanele Siobhan Niamh Aoife Cian Declan Tomas Mateusz Katarzyna Agnieszka
Alan Fiona Ewan Isla Callum Rhys Dylan Owen Gareth Megan Bethan Tariq Imran Zara Nadia Elena Marco Giulia Francesca Luca Alessandro Paolo`.split(/\s+/),
);
const NOT_NAMES = new Set(
  `I I'm Im The A An This That These Those It Its We You He She They My Our Your His Her Their Hi Hello Hey Dear Thanks Thank Regards Best Cheers
Please Sorry Sure Yes No Not Ok Okay Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August
September October November December English French German Spanish Chinese Japanese Python JavaScript TypeScript Java Rust Go SQL API JSON HTTP
Here There Today Tomorrow Yesterday Happy Good Great Fine Back Done Ready New Urgent Customer Support Team Manager Admin User Users Order Account
Billing Sales Engineering Product Legal Finance HR IT Ops Admin Mr Mrs Ms Dr Prof Sir Madam Also And Or But So If When Then Just Still Again Using
Visa Mastercard Amex Stripe Google Apple Microsoft Amazon Anthropic Claude Slack GitHub Gmail Outlook Zoom Teams iPhone Android Windows Linux Mac
Inc Ltd LLC Corp Co Street St Avenue Ave Road Rd London Paris Berlin Madrid Tokyo Dublin Lisbon Boston Chicago Seattle Austin Denver Toronto Sydney
Europe America Asia Africa Q1 Q2 Q3 Q4 CEO CTO CFO VP PM`.split(/\s+/),
);
// Unicode-aware: "Tomás", "Zoë", "O’Neill", "McKay" and "Jean-Luc" are names too.
const NAME_WORD = String.raw`\p{Lu}(?:['’]\p{Lu})?\p{Ll}+(?:\p{Lu}\p{Ll}+)?(?:[-'’]\p{Lu}?\p{Ll}+)?`;
const NAME_SEQ = `${NAME_WORD}(?: ${NAME_WORD}){0,2}`;
const NAME_CUE = new RegExp(
  String.raw`(?:\b(?:[Mm]y name is|[Mm]y name's|[Tt]his is|[Cc]all me|[Ss]igned|[Rr]egards|[Ss]incerely|[Cc]heers|[Tt]hanks|[Dd]ear|[Aa]ttn|[Cc]ontact|[Aa]sk for|[Ss]peak (?:to|with)|[Cc]ustomer|[Pp]atient|[Ee]mployee|[Cc]olleague|[Mm]anager|[Cc]lient|[Nn]ame)[:,]?\s+|\b(?:Mr|Mrs|Ms|Mx|Dr|Prof)\.?\s+|[Ff]rom:\s*|[Cc][Cc]:\s*)(${NAME_SEQ})(?!\p{L})`,
  "gu",
);
const NAME_GAZ = new RegExp(String.raw`(?<!\p{L})(${NAME_WORD})((?: ${NAME_WORD}){1,2})(?!\p{L})`, "gu");
const SELF_INTRO = new RegExp(String.raw`\b(?:I am|I'm|I’m|i am|i'm)\s+(${NAME_SEQ})(?!\p{L})`, "gu");

function nameTokens(seq: string): string[] {
  // Trim trailing words that are not plausibly part of a name.
  const words = seq.split(" ");
  while (words.length && NOT_NAMES.has(words[words.length - 1])) words.pop();
  return words;
}

function detectNames(text: string, out: Finding[]): void {
  const push = (start: number, words: string[]) => {
    if (!words.length || NOT_NAMES.has(words[0])) return;
    const value = words.join(" ");
    out.push({ type: "NAME", start, end: start + value.length, value });
  };
  for (const m of text.matchAll(NAME_CUE)) {
    const seq = m[1];
    push(m.index! + m[0].length - seq.length, nameTokens(seq));
  }
  for (const m of text.matchAll(SELF_INTRO)) {
    const words = nameTokens(m[1]);
    // "I'm Sorry" is not a name: a self-introduction needs a known first name or a full name.
    if (words.length && (FIRST_NAMES.has(words[0]) || words.length >= 2)) push(m.index! + m[0].length - m[1].length, words);
  }
  for (const m of text.matchAll(NAME_GAZ)) {
    if (!FIRST_NAMES.has(m[1])) continue;
    const rest = m[2].trim().split(" ").filter((w) => !NOT_NAMES.has(w));
    if (!rest.length) continue;
    push(m.index!, [m[1], ...rest].slice(0, 3));
  }
}

const PRIORITY: Record<PiiType, number> = { EMAIL: 5, IBAN: 4, CARD: 4, PHONE: 2, NAME: 1 };

/** All PII spans in `text`, non-overlapping, in order. */
export function detect(text: string): Finding[] {
  const found: Finding[] = [];
  for (const m of text.matchAll(EMAIL)) {
    // "git@github.com:org/repo.git" is an SSH remote, not a mailbox.
    if (/^:[\w~./-]/.test(text.slice(m.index! + m[0].length, m.index! + m[0].length + 2))) continue;
    found.push({ type: "EMAIL", start: m.index!, end: m.index! + m[0].length, value: m[0] });
  }
  for (const m of text.matchAll(CARD)) {
    const digits = m[0].replace(/[ -]/g, "");
    if (luhn(digits) && cardNetwork(digits)) found.push({ type: "CARD", start: m.index!, end: m.index! + m[0].length, value: m[0] });
  }
  for (const m of text.matchAll(IBAN)) {
    const want = IBAN_LENGTH[m[0].slice(0, 2)];
    if (!want) continue;
    // Take exactly the country's length in non-space characters, so a following word is not swallowed.
    let n = 0;
    let end = 0;
    for (; end < m[0].length && n < want; end++) if (m[0][end] !== " ") n++;
    const raw = m[0].slice(0, end);
    if (n === want && ibanValid(raw.replace(/ /g, ""))) found.push({ type: "IBAN", start: m.index!, end: m.index! + raw.length, value: raw });
  }
  for (const m of text.matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) continue;
    if (PHONE_VETO.test(text.slice(Math.max(0, m.index! - 24), m.index!))) continue;
    found.push({ type: "PHONE", start: m.index!, end: m.index! + m[0].length, value: m[0] });
  }
  detectNames(text, found);

  found.sort((a, b) => a.start - b.start || PRIORITY[b.type] - PRIORITY[a.type] || b.end - b.start - (a.end - a.start));
  const out: Finding[] = [];
  for (const f of found) {
    const last = out[out.length - 1];
    if (last && f.start < last.end) {
      if (PRIORITY[f.type] > PRIORITY[last.type] || (PRIORITY[f.type] === PRIORITY[last.type] && f.end - f.start > last.end - last.start)) out[out.length - 1] = f;
      continue;
    }
    out.push(f);
  }
  return out;
}

// ------------------------------------------------------------------ vault

const canonical = (type: PiiType, v: string): string => {
  switch (type) {
    case "EMAIL":
      return v.toLowerCase();
    case "PHONE":
    case "CARD":
      return v.replace(/\D/g, "");
    case "IBAN":
      return v.replace(/ /g, "").toUpperCase();
    case "NAME":
      return v.toLowerCase();
  }
};

/** Placeholder ↔ original for one request. The same value always gets the same placeholder. */
export class Vault {
  private byValue = new Map<string, string>();
  private byToken = new Map<string, string>();
  readonly counts: Record<PiiType, number> = { EMAIL: 0, PHONE: 0, CARD: 0, IBAN: 0, NAME: 0 };

  token(type: PiiType, value: string): string {
    const key = type + "\0" + canonical(type, value);
    let tok = this.byValue.get(key);
    if (!tok) {
      tok = `<${type}_${++this.counts[type]}>`;
      this.byValue.set(key, tok);
      this.byToken.set(tok, value);
    }
    return tok;
  }

  original(token: string): string | undefined {
    return this.byToken.get(token);
  }

  get size(): number {
    return this.byToken.size;
  }

  tokens(): string[] {
    return [...this.byToken.keys()];
  }
}

export interface Redaction {
  text: string;
  findings: Finding[];
}

/** Replaces every finding. Reversible mode records originals in the vault; mask mode does not. */
export function redact(text: string, vault: Vault, mode: "reversible" | "mask" = "reversible"): Redaction {
  const findings = detect(text);
  if (!findings.length) return { text, findings };
  let out = "";
  let at = 0;
  for (const f of findings) {
    out += text.slice(at, f.start) + (mode === "reversible" ? vault.token(f.type, f.value) : `[${f.type}]`);
    at = f.end;
  }
  return { text: out + text.slice(at), findings };
}

// ------------------------------------------------------------------ streaming restore

const PLACEHOLDER = /^<([A-Z]{4,5})_(\d{1,4})>/;
const MAX_PLACEHOLDER = 12; // "<EMAIL_9999>"

function viablePrefix(s: string): boolean {
  // s starts with "<" and is shorter than a complete placeholder.
  if (s.length > MAX_PLACEHOLDER) return false;
  const m = /^<([A-Z]*)(_(\d*))?$/.exec(s);
  if (!m) return false;
  const letters = m[1];
  if (m[2] === undefined) return PII_TYPES.some((t) => t.startsWith(letters));
  return (PII_TYPES as readonly string[]).includes(letters) && m[3].length <= 4;
}

/**
 * Restores placeholders in a stream of text chunks. Text is passed on as soon as
 * it cannot be part of a placeholder; at most one partial placeholder (under 12
 * characters) is ever held back.
 */
export class StreamRestorer {
  private held = "";
  restored = 0;
  /** Placeholders that arrived split across two or more chunks. */
  split = 0;
  /** Placeholders the vault did not know (passed through unchanged). */
  unknown = 0;

  constructor(private readonly vault: Vault) {}

  push(chunk: string): string {
    const s = this.held + chunk;
    const heldLen = this.held.length;
    this.held = "";
    let out = "";
    let i = 0;
    for (;;) {
      const j = s.indexOf("<", i);
      if (j < 0) return out + s.slice(i);
      out += s.slice(i, j);
      const rest = s.slice(j);
      const m = PLACEHOLDER.exec(rest);
      if (m) {
        const orig = this.vault.original(m[0]);
        if (orig !== undefined) {
          out += orig;
          this.restored++;
          if (j < heldLen) this.split++;
        } else {
          out += m[0];
          this.unknown++;
        }
        i = j + m[0].length;
        continue;
      }
      if (viablePrefix(rest)) {
        this.held = rest;
        return out;
      }
      out += "<";
      i = j + 1;
    }
  }

  /** End of stream: whatever was held was not a placeholder after all. */
  flush(): string {
    const h = this.held;
    this.held = "";
    return h;
  }

  get holding(): number {
    return this.held.length;
  }
}

/** Non-streaming restore, for whole strings. */
export function restore(text: string, vault: Vault): string {
  const r = new StreamRestorer(vault);
  return r.push(text) + r.flush();
}
