// String comparators used by schema mapping and entity resolution.

const SPECIAL: Record<string, string> = { ß: "ss", ø: "o", Ø: "o", æ: "ae", Æ: "ae", œ: "oe", Œ: "oe", ł: "l", Ł: "l", đ: "d", Đ: "d", þ: "th", Þ: "th", ı: "i" };

/** Lowercase, diacritics removed (José → jose, Søren → soren, Łukasz → lukasz). */
const ASCII_ONLY = /^[\x00-\x7f]*$/;

export function fold(s: string): string {
  if (ASCII_ONLY.test(s)) return s.toLowerCase();
  let out = "";
  for (const ch of s.normalize("NFD")) {
    const code = ch.charCodeAt(0);
    if (code >= 0x300 && code <= 0x36f) continue;
    out += SPECIAL[ch] ?? ch;
  }
  return out.toLowerCase();
}

/** Letters and digits only, folded. */
export function alnum(s: string): string {
  return fold(s).replace(/[^a-z0-9]+/g, "");
}

export function tokens(s: string): string[] {
  return fold(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

let bufA = new Uint8Array(64);
let bufB = new Uint8Array(64);

export function jaro(a: string, b: string): number {
  if (a === b) return a.length ? 1 : 0;
  const la = a.length;
  const lb = b.length;
  if (!la || !lb) return 0;
  const window = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  if (la > bufA.length) bufA = new Uint8Array(la * 2);
  if (lb > bufB.length) bufB = new Uint8Array(lb * 2);
  const ma = bufA;
  const mb = bufB;
  ma.fill(0, 0, la);
  mb.fill(0, 0, lb);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(lb - 1, i + window);
    for (let j = lo; j <= hi; j++) {
      if (mb[j] || a[i] !== b[j]) continue;
      ma[i] = 1;
      mb[j] = 1;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < la; i++) {
    if (!ma[i]) continue;
    while (!mb[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  t /= 2;
  return (matches / la + matches / lb + (matches - t) / matches) / 3;
}

/** Jaro-Winkler with the usual prefix scale 0.1, prefix up to 4, boost applied above 0.7. */
export function jaroWinkler(a: string, b: string, p = 0.1): number {
  const j = jaro(a, b);
  if (j <= 0.7) return j;
  let l = 0;
  const max = Math.min(4, a.length, b.length);
  while (l < max && a[l] === b[l]) l++;
  return j + l * p * (1 - j);
}

/** Levenshtein distance with a two-row table. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** Optimal string alignment distance: Levenshtein plus adjacent transpositions (restricted Damerau). */
export function osa(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (!la) return lb;
  if (!lb) return la;
  // three rolling rows: i-2, i-1, i
  let pp = new Int32Array(lb + 1);
  let prev = new Int32Array(lb + 1);
  let cur = new Int32Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) v = Math.min(v, pp[j - 2] + 1);
      cur[j] = v;
    }
    [pp, prev, cur] = [prev, cur, pp];
  }
  return prev[lb];
}

/** Jaccard similarity of two token sets. */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (!a.length && !b.length) return 1;
  if (a.length <= 8 && b.length <= 8) {
    // small token lists: count distinct shared tokens without allocating sets
    let ua = 0;
    let inter = 0;
    for (let i = 0; i < a.length; i++) {
      if (a.indexOf(a[i]) !== i) continue;
      ua++;
      if (b.includes(a[i])) inter++;
    }
    let ub = 0;
    for (let j = 0; j < b.length; j++) if (b.indexOf(b[j]) === j) ub++;
    return inter / (ua + ub - inter);
  }
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export function tokenJaccard(a: string, b: string): number {
  return jaccard(tokens(a), tokens(b));
}
