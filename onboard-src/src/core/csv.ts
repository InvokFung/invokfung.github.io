// RFC 4180 CSV, plus the things real exports do: a UTF-8 byte-order mark,
// CRLF / LF / CR line endings, quoted fields holding delimiters, quotes ("")
// and line breaks, and a delimiter nobody told you about. The parser scans
// with char codes and slices, so a field is copied once.

export interface CsvResult {
  rows: string[][];
  delimiter: string;
  bom: boolean;
  lineEnding: "CRLF" | "LF" | "CR" | "mixed" | "none";
  /** Fields that were quoted in the source. */
  quoted: number;
  /** Fields whose quotes held a line break. */
  multiline: number;
  /** Blank lines that were skipped. */
  blank: number;
  errors: string[];
}

export const DELIMITERS = [",", ";", "\t", "|"] as const;

const QUOTE = 34;
const LF = 10;
const CR = 13;

/** Counts each candidate delimiter per record (outside quotes) over the first records and keeps the most consistent one. */
export function sniffDelimiter(text: string, maxRecords = 30): string {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const codes = DELIMITERS.map((d) => d.charCodeAt(0));
  const counts: number[][] = DELIMITERS.map(() => []);
  const cur = new Array<number>(DELIMITERS.length).fill(0);
  let inQuotes = false;
  let records = 0;
  let lineHasContent = false;
  const endRecord = () => {
    if (lineHasContent) {
      for (let d = 0; d < cur.length; d++) counts[d].push(cur[d]);
      records++;
    }
    cur.fill(0);
    lineHasContent = false;
  };
  for (let i = 0; i < text.length && records < maxRecords; i++) {
    const ch = text.charCodeAt(i);
    if (ch === QUOTE) {
      if (inQuotes && text.charCodeAt(i + 1) === QUOTE) i++;
      else inQuotes = !inQuotes;
      lineHasContent = true;
      continue;
    }
    if (inQuotes) continue;
    if (ch === LF || ch === CR) {
      if (ch === CR && text.charCodeAt(i + 1) === LF) i++;
      endRecord();
      continue;
    }
    lineHasContent = true;
    const d = codes.indexOf(ch);
    if (d >= 0) cur[d]++;
  }
  if (records < maxRecords) endRecord();

  let best: string = ",";
  let bestScore = -1;
  DELIMITERS.forEach((d, di) => {
    const c = counts[di];
    if (!c.length) return;
    // the mode of the per-record count, and the share of records that agree with it
    const freq = new Map<number, number>();
    for (const x of c) freq.set(x, (freq.get(x) ?? 0) + 1);
    let mode = 0;
    let modeN = 0;
    for (const [x, n] of freq) if (x > 0 && (n > modeN || (n === modeN && x > mode))) (mode = x), (modeN = n);
    if (mode === 0) return;
    const score = (modeN / c.length) * 10 + Math.min(mode, 50) / 50;
    if (score > bestScore) (bestScore = score), (best = d);
  });
  return best;
}

/** Parses CSV text into rows of strings. Never throws; problems are listed in `errors`. */
export function parseCsv(text: string, opts: { delimiter?: string } = {}): CsvResult {
  let bom = false;
  if (text.charCodeAt(0) === 0xfeff) {
    bom = true;
    text = text.slice(1);
  }
  const delimiter = opts.delimiter ?? sniffDelimiter(text);
  const D = delimiter.charCodeAt(0);
  const n = text.length;
  const rows: string[][] = [];
  const errors: string[] = [];
  let row: string[] = [];
  let quoted = 0;
  let multiline = 0;
  let blank = 0;
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  let line = 1;
  let i = 0;

  const endRow = () => {
    if (row.length === 1 && row[0] === "") blank++;
    else rows.push(row);
    row = [];
  };
  /** After a field: consume a delimiter (more fields follow) or a line break (row ends). Returns false at end of input. */
  const afterField = (): boolean => {
    if (i >= n) return false;
    const c = text.charCodeAt(i);
    if (c === D) {
      i++;
      if (i >= n) row.push(""); // trailing delimiter at EOF: one more empty field
      return true;
    }
    if (c === CR && text.charCodeAt(i + 1) === LF) {
      crlf++;
      i += 2;
    } else {
      if (c === CR) cr++;
      else lf++;
      i++;
    }
    line++;
    endRow();
    return true;
  };

  while (i < n) {
    if (text.charCodeAt(i) === QUOTE) {
      // quoted field: copy runs between quotes, "" is a literal quote
      quoted++;
      let j = i + 1;
      let value = "";
      let closed = false;
      for (;;) {
        const q = text.indexOf('"', j);
        if (q < 0) {
          value += text.slice(j);
          j = n;
          break;
        }
        value += text.slice(j, q);
        if (text.charCodeAt(q + 1) === QUOTE) {
          value += '"';
          j = q + 2;
          continue;
        }
        j = q + 1;
        closed = true;
        break;
      }
      if (!closed) {
        errors.push(`unterminated quote starting near line ${line}`);
        row.push(value);
        i = n;
        break;
      }
      const breaks = value.match(/\r\n|\r|\n/g);
      if (breaks) {
        multiline++;
        line += breaks.length;
      }
      // tolerate junk between the closing quote and the next delimiter: keep it, note it
      let k = j;
      while (k < n) {
        const c = text.charCodeAt(k);
        if (c === D || c === LF || c === CR) break;
        k++;
      }
      if (k > j) {
        const junk = text.slice(j, k);
        if (junk.trim()) errors.push(`text after a closing quote on line ${line}`);
        value += junk;
      }
      row.push(value);
      i = k;
      if (!afterField()) break;
      continue;
    }
    // unquoted field: up to the next delimiter or line break
    let k = i;
    while (k < n) {
      const c = text.charCodeAt(k);
      if (c === D || c === LF || c === CR) break;
      k++;
    }
    row.push(text.slice(i, k));
    i = k;
    if (!afterField()) break;
  }
  if (row.length) endRow();

  const kinds = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;
  const lineEnding = kinds === 0 ? "none" : kinds > 1 ? "mixed" : crlf ? "CRLF" : lf ? "LF" : "CR";
  return { rows, delimiter, bom, lineEnding, quoted, multiline, blank, errors };
}

/** Writes rows as CSV, quoting only fields that need it. */
export function toCsv(rows: string[][], opts: { delimiter?: string; eol?: string; bom?: boolean } = {}): string {
  const d = opts.delimiter ?? ",";
  const eol = opts.eol ?? "\n";
  const needs = (s: string) => s.includes(d) || s.includes('"') || s.includes("\n") || s.includes("\r") || /^\s|\s$/.test(s);
  const body = rows.map((r) => r.map((f) => (needs(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(d)).join(eol);
  return (opts.bom ? "﻿" : "") + body + eol;
}
