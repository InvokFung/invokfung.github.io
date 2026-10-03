// Messages between the page and the pipeline worker. Every view is a plain,
// JSON-safe snapshot built in the worker, so the page never holds the
// 10,000 records or the 20,000 candidate pairs itself.

import type { Thresholds } from "../core/er";
import type { GoldenKey, SurvivorRule } from "../core/golden";
import type { PiiPolicy, PiiType, Segment } from "../core/pii";
import type { StageKey } from "../core/pipeline";
import type { ValueType } from "../core/profile";
import type { FieldKey } from "../core/schema";
import type { Value } from "../sql/parse";
import type { SourceFile } from "../core/types";

export type Request =
  | { type: "demo" }
  | { type: "files"; files: SourceFile[] }
  | { type: "overview" }
  | { type: "featured" }
  | { type: "cluster"; golden?: number; record?: number }
  | { type: "search"; query: string }
  | { type: "beforeAfter"; records: number[] }
  | { type: "profile" }
  | { type: "pii" }
  | { type: "policy"; policy: PiiPolicy; key?: string }
  | { type: "mapping" }
  | { type: "setMapping"; source: string; column: string; field: FieldKey | null }
  | { type: "review"; offset: number; limit: number }
  | { type: "decide"; pair: number; same: boolean | null }
  | { type: "oracle" }
  | { type: "thresholds"; thresholds: Thresholds }
  | { type: "model" }
  | { type: "contracts" }
  | { type: "golden"; offset: number; limit: number; query: string }
  | { type: "survivorship"; field: GoldenKey; rule: SurvivorRule }
  | { type: "export"; what: ExportKind }
  | { type: "sqlSchema" }
  | { type: "sql"; query: string };

export type ExportKind = "golden-csv" | "mapping-yaml" | "mapping-sql" | "contracts-yaml";

export type WorkerEvent =
  | { event: "phase"; phase: "generating" | "verifying" | "running" | "ready" | "error"; detail?: string }
  | { event: "stage"; stage: StageKey; ms: number; stats: Record<string, number> };

export type Response = { id: number; ok: true; data: unknown } | { id: number; ok: false; error: string };

export interface SourceSummary {
  id: string;
  label: string;
  name: string;
  format: string;
  rows: number;
  columns: number;
  bytes: number;
  delimiter?: string;
  bom?: boolean;
  lineEnding?: string;
  nested?: number;
  ragged?: number;
  errors: string[];
  mapped: number;
  quarantined: number;
}

export interface Verification {
  name: string;
  sha256: string;
  expected: string;
  ok: boolean;
}

export interface LiveScoreView {
  pairwise: { precision: number; recall: number; f1: number };
  bcubed: { precision: number; recall: number; f1: number };
  trueEntities: number;
  reviewTrue: number;
  pairsCompleteness: number;
  mapping: number;
}

export interface Overview {
  mode: "demo" | "files";
  seed: string | null;
  customers: number | null;
  generateMs: number | null;
  verified: Verification[] | null;
  sources: SourceSummary[];
  stages: { stage: StageKey; ms: number; stats: Record<string, number> }[];
  resolveTimings: { blocking: number; compare: number; em: number; cluster: number };
  totals: {
    records: number;
    columns: number;
    piiSpans: number;
    tokens: number;
    quarantined: number;
    candidates: number;
    totalPairs: number;
    reductionRatio: number;
    autoMatched: number;
    accepted: number;
    review: number;
    decisions: number;
    golden: number;
    multiSource: number;
    merged: number;
  };
  thresholds: Thresholds;
  policy: PiiPolicy;
  survivorship: Record<GoldenKey, SurvivorRule>;
  score: LiveScoreView | null;
}

export interface CellView {
  column: string;
  index: number;
  raw: string;
  field: FieldKey | null;
  /** Redacted text when the cell holds PII inside free text. */
  segments?: Segment[];
}

export interface RecordView {
  i: number;
  source: string;
  row: number;
  line: number;
  sourceId: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  dob: string;
  cells: CellView[];
  quarantined: string[] | null;
  golden: number;
}

export interface LevelView {
  key: string;
  label: string;
  level: number;
  levelLabel: string;
  weight: number;
}

export interface EdgeView {
  pair: number;
  a: number;
  b: number;
  prob: number;
  weight: number;
  veto: string[];
  decision: boolean | null;
  status: "auto" | "review" | "below" | "accepted" | "rejected" | "guarded";
  levels: LevelView[];
}

export interface LineageView {
  rec: number;
  source: string;
  row: number;
  line: number;
  field: FieldKey;
  column: string;
  raw: string;
}

export interface GoldenFieldView {
  key: GoldenKey;
  label: string;
  value: string | null;
  rule: SurvivorRule;
  rules: SurvivorRule[];
  lineage: LineageView[];
  candidates: number;
  agree: number;
  alternatives: string[];
}

export interface GoldenView {
  index: number;
  id: string;
  sources: string[];
  members: number[];
  fields: GoldenFieldView[];
}

export interface ClusterView {
  golden: GoldenView;
  records: RecordView[];
  /** Records outside the cluster that share a candidate pair with it. */
  neighbours: number[];
  edges: EdgeView[];
  thresholds: Thresholds;
  /** Demo only: true customer of each record, as a small integer, for the "truth" overlay. */
  truth: Record<number, number> | null;
}

export interface FeaturedCluster {
  golden: number;
  /** A member record: golden indices move when clusters change, record indices do not. */
  anchor: number;
  id: string;
  name: string;
  records: number;
  sources: string[];
  why: string;
}

export interface ProfileView {
  source: string;
  label: string;
  columns: {
    name: string;
    index: number;
    type: ValueType;
    typeShare: number;
    rows: number;
    nulls: number;
    nullTokens: number;
    distinct: number;
    distinctHll: number;
    hllError: number;
    masks: { mask: string; count: number }[];
    top: { value: string; count: number }[];
    field: FieldKey | null;
  }[];
}

export interface PiiView {
  policy: PiiPolicy;
  tokens: number;
  byType: Record<PiiType, number>;
  columns: { source: string; column: string; cells: number; byType: Partial<Record<PiiType, number>>; embedded: boolean }[];
  samples: { source: string; row: number; column: string; segments: Segment[] }[];
  score: { precision: number; recall: number; regexPrecision: number; regexRecall: number } | null;
}

export interface MappingView {
  sources: {
    id: string;
    label: string;
    name: string;
    columns: { column: string; field: FieldKey | null; confidence: number; name: number; value: number; overridden: boolean; candidates: { field: FieldKey; score: number }[]; sample: string[]; truth: FieldKey | null | undefined }[];
  }[];
  fields: { key: FieldKey; label: string; expects: string }[];
  yaml: string;
  sql: string;
  accuracy: number | null;
}

export interface ReviewItem {
  edge: EdgeView;
  a: RecordView;
  b: RecordView;
  /** Demo only, for after a decision: whether the generator made these the same customer. */
  truth: boolean | null;
}

export interface ReviewView {
  total: number;
  pending: number;
  decided: number;
  items: ReviewItem[];
  score: LiveScoreView | null;
}

export interface ModelView {
  comparators: { key: string; label: string; levels: string[]; m: number[]; u: number[]; weights: number[] }[];
  em: { iterations: number; converged: boolean; logLik: number[]; patterns: number; blockedLambda: number; lambda: number; prior: number; uSample: number };
  blocking: { rules: { name: string; describe: string; blocks: number; largest: number; pairs: number; added: number; skippedBlocks: number }[]; candidates: number; totalPairs: number; reductionRatio: number; maxBlock: number };
  histogram: { bins: number[]; from: number; width: number; truthMatch: number[] | null };
  tfAdjusted: number;
  vetoed: number;
}

export interface ContractsView {
  results: { id: string; description: string; scope: string; severity: string; checked: number; passed: number; failed: number; samples: { label: string; value: string }[] }[];
  quarantine: { rec: number; source: string; row: number; line: number; reasons: string[]; preview: string }[];
  yaml: string;
}

export interface GoldenTableView {
  total: number;
  matching: number;
  columns: string[];
  rows: { index: number; values: (string | number | null)[] }[];
}

export interface BeforeAfterView {
  before: { source: string; columns: string[]; rows: { rec: number; golden: number; cells: string[] }[] }[];
  after: { columns: string[]; rows: { golden: number; cells: (string | number | null)[] }[] };
}

export interface SqlView {
  columns: string[];
  rows: Value[][];
  total: number;
  scanned: number;
  ms: number;
}

export interface SqlSchema {
  tables: { name: string; description: string; rows: number; columns: string[] }[];
}
