// American Soundex (the variant in the US National Archives rules): first
// letter kept, consonants coded, vowels separate repeats, H and W do not.

const CODES: Record<string, string> = {
  b: "1", f: "1", p: "1", v: "1",
  c: "2", g: "2", j: "2", k: "2", q: "2", s: "2", x: "2", z: "2",
  d: "3", t: "3",
  l: "4",
  m: "5", n: "5",
  r: "6",
};

export function soundex(input: string): string {
  const s = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!s) return "";
  let out = s[0].toUpperCase();
  let last = CODES[s[0]] ?? "";
  for (let i = 1; i < s.length && out.length < 4; i++) {
    const ch = s[i];
    const code = CODES[ch];
    if (code) {
      if (code !== last) out += code;
      last = code;
    } else if (ch !== "h" && ch !== "w") {
      last = ""; // a vowel separates two equal codes
    }
  }
  return out.padEnd(4, "0");
}
