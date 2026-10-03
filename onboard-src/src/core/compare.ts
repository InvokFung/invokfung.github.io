// Field comparators for entity resolution. Each turns a pair of records into
// a discrete agreement level (0 = strongest) or -1 when either side is
// missing, which Fellegi-Sunter then weighs. Names are compared in whichever
// orientation fits better, so "Smith Robert" still meets "Robert Smith".

import { nicknameMatch, nicknameVariants } from "./nicknames";
import { jaccard, jaroWinkler, osa } from "./strsim";
import type { Rec } from "./types";

export interface Comparator {
  key: string;
  label: string;
  levels: string[];
  compare(a: Rec, b: Rec, swapped: boolean): number;
}

const NULL = -1;

function nameSim(x: string, y: string): number {
  if (!x || !y) return 0;
  if (x === y || nicknameMatch(x, y)) return 1;
  return jaroWinkler(x, y);
}

/** One keyboard slip: Jaro-Winkler ≥ 0.88, or one edit (Jöeg / Jörg) on names of four letters or more. */
export function typoClose(x: string, y: string, jw = 0.88, known?: number): boolean {
  const s = known ?? jaroWinkler(x, y);
  if (s >= jw) return true;
  // one edit on four or more letters always leaves Jaro-Winkler above 0.75, so skip the edit distance below that
  return s >= 0.75 && Math.min(x.length, y.length) >= 4 && Math.abs(x.length - y.length) <= 1 && osa(x, y) <= 1;
}

/** A nickname written with a typo: NATHAIEL / Nat, Vcitoria / Vicky. */
export function fuzzyNickname(x: string, y: string): boolean {
  if (x.length < 3 || y.length < 3) return false;
  for (const v of nicknameVariants(x)) if (v.length >= 4 && v[0] === y[0] && jaroWinkler(v, y) >= 0.92) return true;
  for (const v of nicknameVariants(y)) if (v.length >= 4 && v[0] === x[0] && jaroWinkler(v, x) >= 0.92) return true;
  return false;
}

/** True when first/last read better crossed over (a.first ≈ b.last and a.last ≈ b.first). */
export function isSwapped(a: Rec, b: Rec): boolean {
  const af = a.k.first;
  const al = a.k.last;
  const bf = b.k.first;
  const bl = b.k.last;
  if (!af || !al || !bf || !bl) return false;
  // cheap gate: crossed parts must start alike (or be nicknames) before any Jaro-Winkler is spent
  if ((af[0] !== bl[0] && !nicknameMatch(af, bl)) || (al[0] !== bf[0] && !nicknameMatch(al, bf))) return false;
  const crossed = nameSim(af, bl) + nameSim(al, bf);
  if (crossed <= 1.7) return false;
  const straight = nameSim(af, bf) + nameSim(al, bl);
  return crossed > straight + 0.25;
}

const firstOf = (r: Rec, swapped: boolean, isA: boolean) => (swapped && !isA ? r.k.last : r.k.first);
const lastOf = (r: Rec, swapped: boolean, isA: boolean) => (swapped && !isA ? r.k.first : r.k.last);
const firstPlainOf = (r: Rec, swapped: boolean, isA: boolean) => (swapped && !isA ? r.k.lastPlain : r.k.firstPlain);
const lastPlainOf = (r: Rec, swapped: boolean, isA: boolean) => (swapped && !isA ? r.k.firstPlain : r.k.lastPlain);

/** One slip, read on the umlaut-collapsed keys or, when the collapse changed either name, on the plain letters. */
function typoEither(x: string, y: string, xp: string, yp: string, jw: number, known?: number): boolean {
  if (typoClose(x, y, jw, known)) return true;
  return (xp !== x || yp !== y) && !!xp && !!yp && typoClose(xp, yp, jw);
}

export const COMPARATORS: Comparator[] = [
  {
    key: "first",
    label: "First name",
    levels: ["exact", "nickname", "typo (Jaro-Winkler ≥ 0.88 or one edit)", "initial only", "different"],
    compare(a, b, swapped) {
      const x = firstOf(a, swapped, true);
      const y = firstOf(b, swapped, false);
      if (!x || !y) return NULL;
      if (x === y) return 0;
      if (nicknameMatch(x, y)) return 1;
      if (typoEither(x, y, firstPlainOf(a, swapped, true), firstPlainOf(b, swapped, false), 0.88)) return 2;
      if (fuzzyNickname(x, y)) return 1;
      if ((x.length === 1 || y.length === 1) && x[0] === y[0]) return 3;
      return 4;
    },
  },
  {
    key: "last",
    label: "Last name",
    levels: ["exact", "typo (Jaro-Winkler ≥ 0.92 or one edit)", "same Soundex", "Jaro-Winkler ≥ 0.80", "different"],
    compare(a, b, swapped) {
      const x = lastOf(a, swapped, true);
      const y = lastOf(b, swapped, false);
      if (!x || !y) return NULL;
      if (x === y) return 0;
      const jw = jaroWinkler(x, y);
      if (typoEither(x, y, lastPlainOf(a, swapped, true), lastPlainOf(b, swapped, false), 0.92, jw)) return 1;
      const sx = swapped ? b.k.firstSx : b.k.lastSx;
      if (a.k.lastSx && a.k.lastSx === sx) return 2;
      if (jw >= 0.8) return 3;
      return 4;
    },
  },
  {
    key: "email",
    label: "Email",
    levels: ["exact", "same mailbox, other domain", "mailbox Jaro-Winkler ≥ 0.9", "different"],
    compare(a, b) {
      if (!a.email || !b.email) return NULL;
      if (a.email === b.email) return 0;
      if (a.k.emailLocal === b.k.emailLocal && a.k.emailLocal.length >= 4) return 1;
      if (a.email.slice(a.email.indexOf("@")) === b.email.slice(b.email.indexOf("@")) && jaroWinkler(a.k.emailLocal, b.k.emailLocal) >= 0.9) return 2;
      return 3;
    },
  },
  {
    key: "phone",
    label: "Phone",
    levels: ["exact (E.164)", "last 7 digits", "different"],
    compare(a, b) {
      if (!a.phone || !b.phone) return NULL;
      if (a.phone === b.phone) return 0;
      if (a.k.phoneTail === b.k.phoneTail) return 1;
      return 2;
    },
  },
  {
    key: "dob",
    label: "Date of birth",
    levels: ["exact", "day and month swapped, or one digit off", "different"],
    compare(a, b) {
      if (!a.dob || !b.dob) return NULL;
      if (a.dob === b.dob) return 0;
      const [ya, ma, da] = a.dob.split("-");
      const [yb, mb, db] = b.dob.split("-");
      if (ya === yb && ma === db && da === mb) return 1;
      let diff = 0;
      for (let i = 0; i < a.dob.length; i++) if (a.dob[i] !== b.dob[i]) diff++;
      return diff === 1 ? 1 : 2;
    },
  },
  {
    key: "address",
    label: "Address",
    levels: ["postcode and street", "postcode", "street and city", "city only", "different"],
    compare(a, b) {
      const ka = a.k;
      const kb = b.k;
      if ((!ka.postcode && !ka.city) || (!kb.postcode && !kb.city)) return NULL;
      const samePost = !!ka.postcode && ka.postcode === kb.postcode;
      const sameCity = !!ka.city && ka.city === kb.city;
      if (!samePost && !sameCity) return 4;
      const streetSim = ka.street.length && kb.street.length ? jaccard(ka.street, kb.street) : 0;
      const sameHouse = !!ka.houseNo && ka.houseNo === kb.houseNo;
      const street = streetSim >= 0.6 || (sameHouse && streetSim >= 0.3);
      if (samePost) return street ? 0 : 1;
      return street ? 2 : 3;
    },
  },
  {
    key: "company",
    label: "Company",
    levels: ["same organisation", "similar name", "different"],
    compare(a, b) {
      const x = a.k.company;
      const y = b.k.company;
      if (!x || !y) return NULL;
      if (x === y) return 0;
      if (jaroWinkler(x, y) >= 0.92 || jaccard(x.split(" "), y.split(" ")) >= 0.5) return 1;
      return 2;
    },
  },
];

/** Comparison vector of a pair, one level per comparator. */
export function gammaOf(a: Rec, b: Rec, out: Int8Array, offset = 0, comparators = COMPARATORS): void {
  const swapped = isSwapped(a, b);
  for (let k = 0; k < comparators.length; k++) out[offset + k] = comparators[k].compare(a, b, swapped);
}
