// The whole pipeline as one stateful session. The worker and `npm run eval`
// both drive this class, so the page and the report measure the same code.
// Later edits (a mapping override, a review decision, a threshold, a
// survivorship rule) re-run only the stages downstream of the change.

import { checkClusters, checkGolden, checkRecords, recValue, type ContractField, type ContractResult } from "./contracts";
import { clusterize, DEFAULT_THRESHOLDS, resolve, type Clustering, type Decisions, type ErResult, type Thresholds } from "./er";
import { buildGolden, goldenRow, preset, type Golden, type SurvivorConfig } from "./golden";
import { ingest } from "./ingest";
import { autoMap, type SourceMapping } from "./mapping";
import { DEFAULT_POLICY, detectPii, redactWith, tokenize, Tokenizer, type PiiPolicy, type PiiSpan, type PiiType, type Segment } from "./pii";
import { profileTable, type ColumnProfile } from "./profile";
import { emptyStats, normalizeTable, type NormalizeStats } from "./records";
import type { FieldKey } from "./schema";
import type { Rec, SourceFile, Table } from "./types";

export type StageKey = "ingest" | "profile" | "pii" | "map" | "normalize" | "contracts" | "resolve" | "golden";

export const STAGES: { key: StageKey; label: string; verb: string }[] = [
  { key: "ingest", label: "Ingest", verb: "parse" },
  { key: "profile", label: "Profile", verb: "profile" },
  { key: "pii", label: "PII scan", verb: "detect" },
  { key: "map", label: "Map", verb: "map" },
  { key: "normalize", label: "Normalize", verb: "clean" },
  { key: "contracts", label: "Contracts", verb: "check" },
  { key: "resolve", label: "Resolve", verb: "match" },
  { key: "golden", label: "Golden", verb: "merge" },
];

export interface StageEvent {
  stage: StageKey;
  ms: number;
  stats: Record<string, number>;
}

export interface PiiColumn {
  source: string;
  column: string;
  index: number;
  cells: number;
  byType: Partial<Record<PiiType, number>>;
  /** PII sits inside longer text, rather than being the whole cell. */
  embedded: boolean;
}

export interface PiiCell {
  source: string;
  row: number;
  col: number;
  spans: PiiSpan[];
}

export interface Options {
  thresholds?: Thresholds;
  policy?: PiiPolicy;
  piiKey?: string;
  survivorship?: SurvivorConfig;
  /** source → column → field (null = unmapped) */
  overrides?: Record<string, Record<string, FieldKey | null>>;
}

export const DEMO_PII_KEY = "onboard-demo-key";

const now = () => performance.now();

export class Session {
  files: SourceFile[] = [];
  tables: Table[] = [];
  tableBySource = new Map<string, Table>();
  profiles = new Map<string, ColumnProfile[]>();
  piiCells: PiiCell[] = [];
  piiColumns: PiiColumn[] = [];
  redacted = new Map<string, Segment[]>();
  /** Distinct values tokenized with HMAC-SHA256 under the current policy. */
  tokenCount = 0;
  mappings = new Map<string, SourceMapping>();
  recs: Rec[] = [];
  norm: NormalizeStats = emptyStats();
  recordContracts: ContractResult[] = [];
  quarantine = new Map<number, string[]>();
  excluded = new Uint8Array(0);
  er!: ErResult;
  thresholds: Thresholds = DEFAULT_THRESHOLDS;
  decisions: Decisions = new Map();
  clustering!: Clustering;
  members: number[][] = [];
  goldenOfRec = new Int32Array(0);
  golden: Golden[] = [];
  clusterContracts: ContractResult[] = [];
  goldenContracts: ContractResult[] = [];
  survivorship!: SurvivorConfig;
  policy: PiiPolicy = DEFAULT_POLICY;
  tokenizer: Tokenizer = new Tokenizer(DEMO_PII_KEY);
  timings: Partial<Record<StageKey, number>> = {};
  /** Finer timings inside the resolve stage. */
  resolveTimings = { blocking: 0, compare: 0, em: 0, cluster: 0 };
  private onStage: (e: StageEvent) => void = () => {};

  static async run(files: SourceFile[], opts: Options = {}, onStage?: (e: StageEvent) => void): Promise<Session> {
    const s = new Session();
    s.files = files;
    if (onStage) s.onStage = onStage;
    if (opts.thresholds) s.thresholds = opts.thresholds;
    if (opts.policy) s.policy = opts.policy;
    if (opts.piiKey) s.tokenizer = new Tokenizer(opts.piiKey);
    s.survivorship = opts.survivorship ?? preset("recommended", files.map((f) => f.id));

    let t = now();
    s.tables = files.map(ingest);
    for (const tb of s.tables) s.tableBySource.set(tb.source, tb);
    s.emit("ingest", now() - t, { records: s.tables.reduce((a, b) => a + b.rows.length, 0), files: files.length, bytes: s.tables.reduce((a, b) => a + b.meta.bytes, 0) });

    t = now();
    for (const tb of s.tables) s.profiles.set(tb.source, profileTable(tb));
    const allProfiles = [...s.profiles.values()].flat();
    s.emit("profile", now() - t, {
      columns: allProfiles.length,
      types: new Set(allProfiles.map((p) => p.type)).size,
      hllMeanError: allProfiles.length ? allProfiles.reduce((a, p) => a + Math.abs(p.hllError), 0) / allProfiles.length : 0,
    });

    t = now();
    await s.scanPii();
    s.emit("pii", now() - t, { spans: s.piiCells.reduce((a, c) => a + c.spans.length, 0), cells: s.piiCells.length, columns: s.piiColumns.length });

    t = now();
    for (const tb of s.tables) {
      const m = autoMap(tb, s.profiles.get(tb.source)!);
      const ov = opts.overrides?.[tb.source];
      if (ov) for (const cm of m) if (cm.column in ov) (cm.field = ov[cm.column]), (cm.overridden = true);
      s.mappings.set(tb.source, m);
    }
    const all = [...s.mappings.values()].flat();
    const mapped = all.filter((m) => m.field);
    s.emit("map", now() - t, { columns: all.length, mapped: mapped.length, confidence: mapped.length ? mapped.reduce((a, m) => a + m.confidence, 0) / mapped.length : 0 });

    s.downstreamOfMapping();
    return s;
  }

  private emit(stage: StageKey, ms: number, stats: Record<string, number>) {
    this.timings[stage] = ms;
    this.onStage({ stage, ms, stats });
  }

  private async scanPii() {
    this.piiCells = [];
    const cols = new Map<string, PiiColumn>();
    for (const tb of this.tables) {
      for (let r = 0; r < tb.rows.length; r++) {
        const row = tb.rows[r];
        for (let c = 0; c < row.length; c++) {
          const v = row[c];
          if (!v) continue;
          const spans = detectPii(v);
          if (!spans.length) continue;
          this.piiCells.push({ source: tb.source, row: r, col: c, spans });
          const key = `${tb.source}\u0000${c}`;
          let pc = cols.get(key);
          if (!pc) cols.set(key, (pc = { source: tb.source, column: tb.columns[c], index: c, cells: 0, byType: {}, embedded: false }));
          pc.cells++;
          const covered = spans.reduce((a, s) => a + s.end - s.start, 0);
          if (covered < v.trim().length * 0.8) pc.embedded = true;
          for (const s of spans) pc.byType[s.type] = (pc.byType[s.type] ?? 0) + 1;
        }
      }
    }
    this.piiColumns = [...cols.values()];
    await this.applyPolicy();
  }

  /** Redacts every cell that holds PII, under the current policy. Tokens are HMAC-SHA256, so this is async. */
  async applyPolicy(policy: PiiPolicy = this.policy, key?: string) {
    this.policy = policy;
    if (key) this.tokenizer = new Tokenizer(key);
    this.redacted.clear();
    // free-text columns are redacted here; structured PII columns (an email column) get the policy at export
    const embedded = new Set(this.piiColumns.filter((c) => c.embedded).map((c) => `${c.source}:${c.index}`));
    const cells = this.piiCells.filter((c) => embedded.has(`${c.source}:${c.col}`));
    const tokens = await tokenize(
      cells.flatMap((c) => c.spans),
      policy,
      this.tokenizer,
    );
    this.tokenCount = tokens.size;
    for (const c of cells) {
      const tb = this.tableBySource.get(c.source)!;
      this.redacted.set(`${c.source}:${c.row}:${c.col}`, redactWith(tb.rows[c.row][c.col], c.spans, policy, tokens));
    }
  }

  /** Normalize, contracts, resolve and golden: everything that depends on the mapping. */
  downstreamOfMapping() {
    let t = now();
    this.norm = emptyStats();
    this.recs = [];
    for (const tb of this.tables) this.recs.push(...normalizeTable(tb, this.mappings.get(tb.source)!, this.recs.length, this.norm));
    this.emit("normalize", now() - t, {
      records: this.recs.length,
      phones: this.norm.phones.e164,
      dates: this.norm.dates.parsed,
      ambiguous: this.norm.dates.ambiguous,
      emails: this.norm.emails.valid,
      amounts: this.norm.money.converted,
    });

    t = now();
    const raw = (r: Rec, f: ContractField) => {
      const key = ({ email: "email", phone: "phone", country: "country", full_name: "full_name" } as Record<string, FieldKey>)[f];
      const c = key ? r.col[key] : undefined;
      if (c === undefined) return f === "full_name" ? recValue(r, f) : "";
      return (this.tableBySource.get(r.source)!.rows[r.row][c] ?? "").trim();
    };
    const rc = checkRecords(this.recs, raw);
    this.recordContracts = rc.results;
    this.quarantine = rc.quarantine;
    this.excluded = new Uint8Array(this.recs.length);
    for (const i of this.quarantine.keys()) this.excluded[i] = 1;
    this.emit("contracts", now() - t, { rules: rc.results.length, failures: rc.results.reduce((a, r) => a + r.failed, 0), quarantined: this.quarantine.size });

    t = now();
    this.er = resolve(this.recs, { skip: this.excluded });
    this.decisions = new Map();
    const tc = now();
    this.clustering = clusterize(this.recs.length, this.er.pairs, this.thresholds, this.decisions, this.excluded);
    this.resolveTimings = { ...this.er.timings, cluster: now() - tc };
    this.emit("resolve", now() - t, {
      candidates: this.er.blocking.candidates,
      reduction: this.er.blocking.reductionRatio,
      matched: this.clustering.autoMatched,
      review: this.clustering.review.length,
      clusters: this.clustering.clusters - this.quarantine.size,
    });

    this.goldenStage();
  }

  /** Clusters → golden records → cluster and golden contracts. */
  goldenStage() {
    const t = now();
    const byLabel = new Map<number, number[]>();
    const labels = this.clustering.labels;
    for (let i = 0; i < labels.length; i++) {
      if (this.excluded[i]) continue;
      let arr = byLabel.get(labels[i]);
      if (!arr) byLabel.set(labels[i], (arr = []));
      arr.push(i);
    }
    this.members = [...byLabel.values()];
    this.golden = buildGolden(this.recs, this.members, this.tableBySource, this.survivorship);
    this.goldenOfRec = new Int32Array(this.recs.length).fill(-1);
    this.golden.forEach((g, gi) => g.members.forEach((i) => (this.goldenOfRec[i] = gi)));
    this.clusterContracts = checkClusters(this.recs, this.members);
    this.goldenContracts = checkGolden(this.golden.map((g) => ({ email: g.values.email?.value ?? "" })));
    this.emit("golden", now() - t, { golden: this.golden.length, multiSource: this.golden.filter((g) => g.sources.length > 1).length, merged: this.golden.filter((g) => g.members.length > 1).length });
  }

  recluster() {
    const t = now();
    this.clustering = clusterize(this.recs.length, this.er.pairs, this.thresholds, this.decisions, this.excluded);
    this.resolveTimings.cluster = now() - t;
    this.goldenStage();
  }

  setThresholds(th: Thresholds) {
    this.thresholds = th;
    this.recluster();
  }

  decide(pair: number, same: boolean | null) {
    if (same === null) this.decisions.delete(pair);
    else this.decisions.set(pair, same);
    this.recluster();
  }

  setSurvivorship(cfg: SurvivorConfig) {
    this.survivorship = cfg;
    this.goldenStage();
  }

  setMapping(source: string, column: string, field: FieldKey | null) {
    const m = this.mappings.get(source);
    if (!m) return;
    for (const cm of m) {
      if (cm.column === column) {
        cm.field = field;
        cm.overridden = true;
      } else if (field && cm.field === field) {
        cm.field = null; // a field maps from one column per source
        cm.overridden = true;
      }
    }
    this.downstreamOfMapping();
  }

  goldenRows() {
    return this.golden.map((g) => goldenRow(g, this.recs));
  }
}
