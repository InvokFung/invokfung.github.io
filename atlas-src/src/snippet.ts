import { tokenize } from "./search/text";

export interface Segment {
  text: string;
  hit: boolean;
}

/** Splits text into runs, marking words that match a query term the same way the index does. */
export function highlight(text: string, query: string): Segment[] {
  const terms = new Set(tokenize(query));
  if (!terms.size) return [{ text, hit: false }];
  const out: Segment[] = [];
  for (const part of text.split(/(\s+)/)) {
    const hit = !/^\s*$/.test(part) && tokenize(part).some((t) => terms.has(t));
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += part;
    else out.push({ text: part, hit });
  }
  return out;
}

/** The ~max-character window of text holding the most query matches. */
export function snippet(text: string, query: string, max = 240): Segment[] {
  const terms = new Set(tokenize(query));
  const positions: number[] = [];
  for (const m of text.matchAll(/\S+/g)) if (tokenize(m[0]).some((t) => terms.has(t))) positions.push(m.index!);
  let start = 0;
  if (positions.length) {
    let best = 0;
    for (let i = 0; i < positions.length; i++) {
      const from = Math.max(0, positions[i] - 40);
      const count = positions.filter((p) => p >= from && p < from + max).length;
      if (count > best) {
        best = count;
        start = from;
      }
    }
    if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  }
  let end = Math.min(text.length, start + max);
  if (end < text.length) end = text.lastIndexOf(" ", end) || end;
  const body = (start > 0 ? "… " : "") + text.slice(start, end).trim() + (end < text.length ? " …" : "");
  return highlight(body, query);
}
