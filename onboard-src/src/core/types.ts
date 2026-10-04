import type { FieldKey } from "./schema";

/** One input file, as text. */
export interface SourceFile {
  /** Short stable id: crm, billing, support, or upload-1… */
  id: string;
  /** Human label: "CRM export". */
  label: string;
  /** File name as delivered. */
  name: string;
  text: string;
}

export interface IngestMeta {
  format: "csv" | "json" | "ndjson";
  bytes: number;
  delimiter?: string;
  bom?: boolean;
  lineEnding?: string;
  quoted?: number;
  multiline?: number;
  blank?: number;
  ragged?: number;
  nestedPaths?: number;
  errors: string[];
}

/** A source after ingest: a header and rows of raw strings, nothing interpreted yet. */
export interface Table {
  source: string;
  label: string;
  name: string;
  columns: string[];
  rows: string[][];
  /** Where each row starts in the file: data row number for CSV, line number for NDJSON. */
  lines: number[];
  meta: IngestMeta;
}

/** A normalized source record in the canonical schema. */
export interface Rec {
  /** Index in the combined record list. */
  i: number;
  source: string;
  /** Row index within its table. */
  row: number;
  sourceId: string;
  first: string;
  last: string;
  email: string;
  phone: string;
  company: string;
  street: string;
  city: string;
  postcode: string;
  country: string;
  dob: string;
  created: string;
  updated: string;
  balance: number | null;
  currency: string;
  balanceBase: number | null;
  notes: string;
  /** The column index each canonical field was read from. */
  col: Partial<Record<FieldKey, number>>;
  /** Comparison keys, computed once. */
  k: MatchKeys;
  flags: number;
}

export interface MatchKeys {
  first: string;
  last: string;
  firstSx: string;
  lastSx: string;
  firstRoot: string;
  /** Folded letters without the umlaut collapse, for when the collapse misfires (Noemie is not Nömie). */
  firstPlain: string;
  lastPlain: string;
  emailLocal: string;
  phoneTail: string;
  company: string;
  street: string[];
  houseNo: string;
  postcode: string;
  city: string;
}

export const FLAG = {
  AMBIGUOUS_DATE: 1,
  PHONE_INVALID: 2,
  EMAIL_INVALID: 4,
  NAME_SPLIT: 8,
  NAME_RECASED: 16,
  EMAIL_PLUS: 32,
  CURRENCY_CONVERTED: 64,
  DATE_INVALID: 128,
  NAME_COMMA: 256,
} as const;
