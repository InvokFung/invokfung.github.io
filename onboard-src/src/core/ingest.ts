// Ingest: a file's text into a Table of raw strings. Format by extension
// first, then by content. CSV headers are cleaned (blank and duplicate
// names), ragged rows padded or cut and counted.

import { parseCsv } from "./csv";
import { parseJsonRecords, recordsToTable } from "./json";
import type { SourceFile, Table } from "./types";

export function detectFormat(file: Pick<SourceFile, "name" | "text">): "csv" | "json" {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (["json", "ndjson", "jsonl"].includes(ext)) return "json";
  if (["csv", "tsv"].includes(ext)) return "csv";
  const head = file.text.replace(/^﻿/, "").trimStart();
  return head.startsWith("{") || head.startsWith("[") ? "json" : "csv";
}

function cleanHeader(cols: string[]): string[] {
  const seen = new Map<string, number>();
  return cols.map((c, i) => {
    let name = c.trim() || `column_${i + 1}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n) name = `${name} (${n + 1})`;
    return name;
  });
}

export function ingest(file: SourceFile): Table {
  const bytes = new TextEncoder().encode(file.text).length;
  if (detectFormat(file) === "json") {
    const parsed = parseJsonRecords(file.text);
    const { columns, rows } = recordsToTable(parsed.records);
    return {
      source: file.id,
      label: file.label,
      name: file.name,
      columns,
      rows,
      lines: parsed.lines,
      meta: { format: parsed.format, bytes, nestedPaths: columns.filter((c) => c.includes(".") || c.includes("[")).length, errors: parsed.errors },
    };
  }
  const csv = parseCsv(file.text);
  const [header = [], ...body] = csv.rows;
  const columns = cleanHeader(header);
  let ragged = 0;
  const rows = body.map((r) => {
    if (r.length === columns.length) return r;
    ragged++;
    if (r.length > columns.length) return r.slice(0, columns.length);
    return [...r, ...new Array<string>(columns.length - r.length).fill("")];
  });
  return {
    source: file.id,
    label: file.label,
    name: file.name,
    columns,
    rows,
    lines: rows.map((_, i) => i + 1),
    meta: {
      format: "csv",
      bytes,
      delimiter: csv.delimiter,
      bom: csv.bom,
      lineEnding: csv.lineEnding,
      quoted: csv.quoted,
      multiline: csv.multiline,
      blank: csv.blank,
      ragged,
      errors: csv.errors,
    },
  };
}
