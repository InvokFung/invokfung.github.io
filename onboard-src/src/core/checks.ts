// Checksums that turn "looks like a card number" into "is a card number".

/** Luhn (mod 10) over a digit string; separators must already be removed. */
export function luhn(digits: string): boolean {
  if (!/^\d{2,}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** The digit that makes `partial + digit` pass Luhn. */
export function luhnCheckDigit(partial: string): string {
  for (let d = 0; d < 10; d++) if (luhn(partial + d)) return String(d);
  throw new Error("unreachable");
}

/** Plausible card: 13–19 digits, a known network prefix, Luhn-valid. */
export function isCardNumber(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  const two = Number(digits.slice(0, 2));
  const four = Number(digits.slice(0, 4));
  const network = digits[0] === "4" || (two >= 51 && two <= 55) || (four >= 2221 && four <= 2720) || two === 34 || two === 37 || digits.startsWith("6011") || two === 65;
  return network && luhn(digits);
}

/** IBAN lengths by country (ISO 13616 registry, the countries this tool knows). */
export const IBAN_LENGTHS: Record<string, number> = {
  AT: 20, BE: 16, CH: 21, CZ: 24, DE: 22, DK: 18, ES: 24, FI: 18, FR: 27, GB: 22, IE: 22,
  IT: 27, LU: 20, NL: 18, NO: 15, PL: 28, PT: 25, SE: 24, SK: 24,
};

/** Remainder mod 97 of the IBAN number string, computed in chunks so it never leaves 53-bit precision. */
function mod97(numeric: string): number {
  let r = 0;
  for (let i = 0; i < numeric.length; i += 7) r = Number(String(r) + numeric.slice(i, i + 7)) % 97;
  return r;
}

function ibanNumeric(rearranged: string): string {
  let out = "";
  for (const ch of rearranged) {
    const c = ch.charCodeAt(0);
    out += c >= 65 && c <= 90 ? String(c - 55) : ch;
  }
  return out;
}

export function ibanValid(input: string): boolean {
  const s = input.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return false;
  const len = IBAN_LENGTHS[s.slice(0, 2)];
  if (!len || s.length !== len) return false;
  return mod97(ibanNumeric(s.slice(4) + s.slice(0, 4))) === 1;
}

/** Two check digits for a country and BBAN (ISO 7064 MOD 97-10). */
export function ibanCheckDigits(country: string, bban: string): string {
  const r = mod97(ibanNumeric(bban + country + "00"));
  return String(98 - r).padStart(2, "0");
}

/** Groups an IBAN in fours, as people write it. */
export function formatIban(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();
}
