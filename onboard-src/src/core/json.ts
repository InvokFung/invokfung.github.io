// JSON and NDJSON exports into the same flat table shape as CSV. Nested
// objects become dotted paths (holder.name.given); arrays of scalars are
// joined, arrays of objects are indexed (invoices[0].amount, up to a limit).

export type Flat = Record<string, string>;

const MAX_ARRAY_OBJECTS = 3;

function scalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export function flatten(value: unknown, prefix = "", out: Flat = {}): Flat {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length && prefix) out[prefix] = "";
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== "object")) {
      out[prefix] = value.map(scalar).join("; ");
    } else {
      value.slice(0, MAX_ARRAY_OBJECTS).forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
      if (value.length > MAX_ARRAY_OBJECTS) out[`${prefix}.length`] = String(value.length);
    }
    return out;
  }
  out[prefix || "value"] = scalar(value);
  return out;
}

export interface JsonParse {
  format: "json" | "ndjson";
  records: unknown[];
  /** 1-based line number of each record (NDJSON) or its index + 1 (JSON array). */
  lines: number[];
  errors: string[];
}

/** Detects NDJSON vs a JSON document; a document that wraps one array (`{"data": [...]}`) is unwrapped. */
export function parseJsonRecords(text: string): JsonParse {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const trimmed = text.trimStart();
  const errors: string[] = [];
  // Try a whole document first; NDJSON fails here because of the second line.
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const doc = JSON.parse(text);
      let arr: unknown[] | null = Array.isArray(doc) ? doc : null;
      if (!arr && doc && typeof doc === "object") {
        const arrays = Object.values(doc as Record<string, unknown>).filter(Array.isArray) as unknown[][];
        if (arrays.length === 1) arr = arrays[0];
        else arr = [doc];
      }
      arr ??= [doc];
      return { format: "json", records: arr, lines: arr.map((_, i) => i + 1), errors };
    } catch {
      // fall through to NDJSON
    }
  }
  const records: unknown[] = [];
  const lines: number[] = [];
  const parts = text.split(/\r?\n/);
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i].trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
      lines.push(i + 1);
    } catch {
      if (errors.length < 20) errors.push(`line ${i + 1} is not valid JSON`);
    }
  }
  return { format: "ndjson", records, lines, errors };
}

/** Flattens records into columns (first-seen order) and rows. */
export function recordsToTable(records: unknown[]): { columns: string[]; rows: string[][] } {
  const flats = records.map((r) => flatten(r));
  const index = new Map<string, number>();
  const columns: string[] = [];
  for (const f of flats)
    for (const k of Object.keys(f))
      if (!index.has(k)) {
        index.set(k, columns.length);
        columns.push(k);
      }
  const rows = flats.map((f) => {
    const row = new Array<string>(columns.length).fill("");
    for (const [k, v] of Object.entries(f)) row[index.get(k)!] = v;
    return row;
  });
  return { columns, rows };
}
