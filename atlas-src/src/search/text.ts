// Tokenizer shared by the build scripts and the browser, so a query is
// split exactly the way the index was.

const STOP = new Set(
  (
    "a an and are as at be been being but by can could did do does doing for from had has have having he her " +
    "here hers him his how i if in into is it its itself just me more most my no nor not of off on once only or " +
    "other our ours out over own same she should so some such than that the their theirs them then there these " +
    "they this those through to too under until up very was we were what when where which while who whom why " +
    "will with would you your yours also each few both all any about above after again against below before " +
    "between during further s t don now let get got use used using via one two eg ie etc vs may might must"
  ).split(" "),
);

// Library names whose dotted form would otherwise split into noise.
const ALIASES: [RegExp, string][] = [
  [/c\+\+/g, " cpp "],
  [/c#/g, " csharp "],
  [/\bnode\.js\b/g, " nodejs "],
  [/\bnext\.js\b/g, " nextjs "],
  [/\bthree\.js\b/g, " threejs "],
  [/\bvue\.js\b/g, " vue "],
  [/\breact\.js\b/g, " react "],
  [/\bnuxt\.js\b/g, " nuxt "],
];

// Light plural folding only: a full stemmer conflates too much in technical
// text (e.g. "caching" vs "cache"), and LSA picks up the remaining relations.
export function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is|os|js)$/.test(w)) return w.slice(0, -1);
  return w;
}

const CJK = /\p{Script=Han}/u;

export function tokenize(text: string): string[] {
  let s = text.toLowerCase();
  for (const [re, to] of ALIASES) s = s.replace(re, to);
  const out: string[] = [];
  // Dotted numbers stay whole so "0.1", "TLS 1.3" and "Python 3.11" are searchable.
  for (const m of s.matchAll(/\d+(?:\.\d+)+|[a-z0-9]+|\p{Script=Han}+/gu)) {
    const w = m[0];
    if (CJK.test(w)) {
      if (w.length === 1) out.push(w);
      else for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2));
      continue;
    }
    if (w.includes(".")) {
      out.push(w);
      continue;
    }
    if (w.length < 2 || w.length > 30) continue;
    if (STOP.has(w)) continue;
    if (/^\d+$/.test(w) && w.length > 4) continue;
    out.push(stem(w));
  }
  return out;
}
