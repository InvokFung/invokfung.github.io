// Snapshots of a Session for the page: small, JSON-safe, built on request.
// Pure functions of the session (and, for the synthetic demo, the
// generator's truth), so `npm test` can exercise them in Node.

import { toCsv } from "../core/csv";
import { isSwapped } from "../core/compare";
import { contractsYaml } from "../core/contracts";
import { VETO, VETO_LABEL } from "../core/er";
import { GOLDEN_FIELDS, goldenRow, RULE_LABEL, type GoldenKey, type SurvivorRule } from "../core/golden";
import { toSql, toYaml } from "../core/mapping";
import { mask, PII_TYPES, tokenize, type PiiType } from "../core/pii";
import type { Session, StageEvent } from "../core/pipeline";
import { FIELDS, type FieldKey } from "../core/schema";
import { entityLabels, liveScore, mappingScore, oracleDecisions, piiScore } from "../core/score";
import type { Rec } from "../core/types";
import type { Truth } from "../gen/generate";
import { runSql, type Row, type SqlTable } from "../sql/run";
import type {
  BeforeAfterView,
  ClusterView,
  ContractsView,
  EdgeView,
  ExportKind,
  FeaturedCluster,
  GoldenTableView,
  GoldenView,
  LiveScoreView,
  MappingView,
  ModelView,
  Overview,
  PiiView,
  ProfileView,
  RecordView,
  ReviewView,
  SqlSchema,
  SqlView,
  Verification,
} from "./protocol";

export interface Ctx {
  s: Session;
  mode: "demo" | "files";
  seed: string | null;
  customers: number | null;
  truth: Truth | null;
  generateMs: number | null;
  verified: Verification[] | null;
  stages: Map<string, StageEvent>;
  /** Derived state, rebuilt lazily after a change. */
  cache: {
    labels?: Int32Array;
    adjacency?: Map<number, number[]>;
    pii?: { precision: number; recall: number; regexPrecision: number; regexRecall: number };
    sql?: Map<string, SqlTable>;
  };
}

/** Call after anything that changes records or clusters. */
export function invalidate(ctx: Ctx, what: "records" | "clusters") {
  if (what === "records") {
    ctx.cache.labels = undefined;
    ctx.cache.adjacency = undefined;
  }
  ctx.cache.sql = undefined;
}

function labels(ctx: Ctx): Int32Array | null {
  if (!ctx.truth) return null;
  return (ctx.cache.labels ??= entityLabels(ctx.s, ctx.truth));
}

function adjacency(ctx: Ctx): Map<number, number[]> {
  if (ctx.cache.adjacency) return ctx.cache.adjacency;
  const adj = new Map<number, number[]>();
  const { a, b } = ctx.s.er.pairs;
  for (let p = 0; p < a.length; p++) {
    for (const r of [a[p], b[p]]) {
      let l = adj.get(r);
      if (!l) adj.set(r, (l = []));
      l.push(p);
    }
  }
  return (ctx.cache.adjacency = adj);
}

const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

export function score(ctx: Ctx): LiveScoreView | null {
  const lb = labels(ctx);
  if (!lb || !ctx.truth) return null;
  const l = liveScore(ctx.s, lb);
  return {
    pairwise: { precision: round(l.er.pairwise.precision), recall: round(l.er.pairwise.recall), f1: round(l.er.pairwise.f1) },
    bcubed: { precision: round(l.er.bcubed.precision), recall: round(l.er.bcubed.recall), f1: round(l.er.bcubed.f1) },
    trueEntities: l.trueEntities,
    reviewTrue: l.review.trueMatches,
    pairsCompleteness: round(l.pairsCompleteness),
    mapping: round(mappingScore(ctx.s, ctx.truth).accuracy),
  };
}

export function overview(ctx: Ctx): Overview {
  const s = ctx.s;
  const quarantinedBySource = new Map<string, number>();
  for (const i of s.quarantine.keys()) quarantinedBySource.set(s.recs[i].source, (quarantinedBySource.get(s.recs[i].source) ?? 0) + 1);
  let accepted = 0;
  for (const d of s.decisions.values()) if (d) accepted++;
  return {
    mode: ctx.mode,
    seed: ctx.seed,
    customers: ctx.customers,
    generateMs: ctx.generateMs,
    verified: ctx.verified,
    sources: s.tables.map((t) => ({
      id: t.source,
      label: t.label,
      name: t.name,
      format: t.meta.format,
      rows: t.rows.length,
      columns: t.columns.length,
      bytes: t.meta.bytes,
      delimiter: t.meta.delimiter,
      bom: t.meta.bom,
      lineEnding: t.meta.lineEnding,
      nested: t.meta.nestedPaths,
      ragged: t.meta.ragged,
      errors: t.meta.errors.slice(0, 5),
      mapped: (s.mappings.get(t.source) ?? []).filter((m) => m.field).length,
      quarantined: quarantinedBySource.get(t.source) ?? 0,
    })),
    stages: [...ctx.stages.values()].map((e) => ({ stage: e.stage, ms: e.ms, stats: e.stats })),
    resolveTimings: s.resolveTimings,
    totals: {
      records: s.recs.length,
      columns: s.tables.reduce((a, t) => a + t.columns.length, 0),
      piiSpans: s.piiCells.reduce((a, c) => a + c.spans.length, 0),
      tokens: s.tokenCount,
      quarantined: s.quarantine.size,
      candidates: s.er.blocking.candidates,
      totalPairs: s.er.blocking.totalPairs,
      reductionRatio: s.er.blocking.reductionRatio,
      autoMatched: s.clustering.autoMatched,
      accepted,
      review: s.clustering.review.length,
      decisions: s.decisions.size,
      golden: s.golden.length,
      multiSource: s.golden.filter((g) => g.sources.length > 1).length,
      merged: s.golden.filter((g) => g.members.length > 1).length,
    },
    thresholds: s.thresholds,
    policy: s.policy,
    survivorship: s.survivorship.rules,
    score: score(ctx),
  };
}

// ------------------------------------------------------------------ records and edges

export function recordView(ctx: Ctx, i: number): RecordView {
  const s = ctx.s;
  const r = s.recs[i];
  const t = s.tableBySource.get(r.source)!;
  const fieldOf = new Map<number, FieldKey>();
  for (const [f, c] of Object.entries(r.col)) fieldOf.set(c as number, f as FieldKey);
  return {
    i,
    source: r.source,
    row: r.row,
    line: t.lines[r.row],
    sourceId: r.sourceId,
    name: [r.first, r.last].filter(Boolean).join(" "),
    email: r.email,
    phone: r.phone,
    city: r.city,
    country: r.country,
    dob: r.dob,
    cells: t.columns.map((column, c) => {
      const segments = s.redacted.get(`${r.source}:${r.row}:${c}`);
      return { column, index: c, raw: t.rows[r.row][c] ?? "", field: fieldOf.get(c) ?? null, ...(segments ? { segments } : {}) };
    }),
    quarantined: s.quarantine.get(i) ?? null,
    golden: s.goldenOfRec[i],
  };
}

export function edgeView(ctx: Ctx, p: number): EdgeView {
  const s = ctx.s;
  const { pairs, model } = s.er;
  const K = model.comparators.length;
  const decision = s.decisions.get(p);
  const veto = pairs.veto[p];
  const prob = pairs.prob[p];
  const status: EdgeView["status"] =
    decision === true ? "accepted" : decision === false ? "rejected" : veto ? "guarded" : prob >= s.thresholds.match ? "auto" : prob >= s.thresholds.review ? "review" : "below";
  return {
    pair: p,
    a: pairs.a[p],
    b: pairs.b[p],
    prob: pairs.prob[p],
    weight: round(pairs.weight[p], 2),
    veto: [VETO.FIRST, VETO.DOB].filter((v) => veto & v).map((v) => VETO_LABEL[v]),
    decision: decision ?? null,
    status,
    levels: model.comparators.map((c, k) => {
      const level = pairs.gammas[p * K + k];
      return { key: c.key, label: c.label, level, levelLabel: level < 0 ? "missing" : c.levels[level], weight: level < 0 ? 0 : round(pairs.contrib[p * K + k], 2) };
    }),
  };
}

function goldenView(ctx: Ctx, index: number): GoldenView {
  const g = ctx.s.golden[index];
  return {
    index,
    id: g.id,
    sources: g.sources,
    members: g.members,
    fields: GOLDEN_FIELDS.map((spec) => {
      const v = g.values[spec.key];
      return {
        key: spec.key,
        label: spec.label,
        value: v?.value ?? null,
        rule: v?.rule ?? ctx.s.survivorship.rules[spec.key],
        rules: spec.rules,
        lineage: v?.lineage ?? [],
        candidates: v?.candidates ?? 0,
        agree: v?.agree ?? 0,
        alternatives: v?.alternatives ?? [],
      };
    }),
  };
}

export function cluster(ctx: Ctx, req: { golden?: number; record?: number }): ClusterView {
  const s = ctx.s;
  let gi = req.golden ?? (req.record !== undefined ? s.goldenOfRec[req.record] : 0);
  if (gi < 0 || gi >= s.golden.length) gi = 0;
  const g = s.golden[gi];
  const inside = new Set(g.members);
  const adj = adjacency(ctx);
  // neighbours: outside records with the strongest candidate pairs into the cluster
  const outside = new Map<number, number>();
  for (const i of g.members)
    for (const p of adj.get(i) ?? []) {
      const o = s.er.pairs.a[p] === i ? s.er.pairs.b[p] : s.er.pairs.a[p];
      if (inside.has(o) || s.excluded[o]) continue;
      outside.set(o, Math.max(outside.get(o) ?? 0, s.er.pairs.prob[p]));
    }
  const neighbours = [...outside.entries()]
    .filter(([, pr]) => pr >= 0.01)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4)
    .map(([o]) => o);
  const nodes = new Set([...g.members, ...neighbours]);
  const edges: EdgeView[] = [];
  const seen = new Set<number>();
  for (const i of nodes)
    for (const p of adj.get(i) ?? []) {
      if (seen.has(p)) continue;
      const a = s.er.pairs.a[p];
      const b = s.er.pairs.b[p];
      if (nodes.has(a) && nodes.has(b)) {
        seen.add(p);
        edges.push(edgeView(ctx, p));
      }
    }
  const lb = labels(ctx);
  let truth: Record<number, number> | null = null;
  if (lb) {
    truth = {};
    const ids = new Map<number, number>();
    for (const i of nodes) {
      if (!ids.has(lb[i])) ids.set(lb[i], ids.size);
      truth[i] = ids.get(lb[i])!;
    }
  }
  return { golden: goldenView(ctx, gi), records: [...nodes].map((i) => recordView(ctx, i)), neighbours, edges, thresholds: s.thresholds, truth };
}

function describe(ctx: Ctx, gi: number): { score: number; why: string[] } {
  const s = ctx.s;
  const g = s.golden[gi];
  const recs = g.members.map((i) => s.recs[i]);
  const why: string[] = [];
  let score = g.sources.length * 2;
  const firsts = new Set(recs.map((r) => r.k.first).filter(Boolean));
  const adj = adjacency(ctx);
  const inside = new Set(g.members);
  let nickname = "";
  let typo = false;
  let swapped = false;
  let otherDomain = false;
  let nearMiss = false;
  let guarded = false;
  const K = s.er.model.comparators.length;
  for (const i of g.members)
    for (const p of adj.get(i) ?? []) {
      const a = s.er.pairs.a[p];
      const b = s.er.pairs.b[p];
      const both = inside.has(a) && inside.has(b);
      if (!both) {
        if (s.er.pairs.prob[p] >= 0.3) nearMiss = true;
        continue;
      }
      if (s.er.pairs.veto[p]) guarded = true;
      const gm = s.er.pairs.gammas.subarray(p * K, p * K + K);
      const sw = isSwapped(s.recs[a], s.recs[b]);
      // comparators read b's names crossed over when the pair is swapped
      if (gm[0] === 1 && !nickname) nickname = `${s.recs[a].first} / ${sw ? s.recs[b].last : s.recs[b].first}`;
      if (gm[0] === 2 || gm[1] === 1) typo = true;
      if (gm[2] === 1) otherDomain = true;
      if (sw) swapped = true;
    }
  if (nickname) (why.push(`nickname: ${nickname}`), (score += 2));
  if (swapped) (why.push("first and last name swapped"), (score += 2));
  if (typo) (why.push("a typo in the name"), (score += 1));
  if (otherDomain) (why.push("same mailbox at another domain"), (score += 1));
  const phoneRaw = new Set<string>();
  const dateRaw = new Set<string>();
  for (const r of recs) {
    const t = s.tableBySource.get(r.source)!;
    if (r.col.phone !== undefined && r.phone) phoneRaw.add(t.rows[r.row][r.col.phone]);
    if (r.col.date_of_birth !== undefined && r.dob) dateRaw.add(t.rows[r.row][r.col.date_of_birth]);
  }
  if (phoneRaw.size >= 3) (why.push(`one phone written ${phoneRaw.size} ways`), (score += 1));
  if (dateRaw.size >= 2) (why.push(`birth date in ${dateRaw.size} formats`), (score += 1));
  if (nearMiss) score += 1;
  if (guarded) score += 1;
  if (firsts.size >= 2) score += 1;
  if (recs.length > 6) score -= 3;
  return { score, why };
}

export function featured(ctx: Ctx): FeaturedCluster[] {
  const s = ctx.s;
  const lb = labels(ctx);
  // a featured customer must be one the pipeline got exactly right: all its records, nobody else's
  const size = new Map<number, number>();
  if (lb) for (let i = 0; i < lb.length; i++) if (!s.excluded[i]) size.set(lb[i], (size.get(lb[i]) ?? 0) + 1);
  const pure = (gi: number) => {
    if (!lb) return true;
    const g = s.golden[gi];
    const e = lb[g.members[0]];
    return g.members.every((i) => lb[i] === e) && size.get(e) === g.members.length;
  };
  const scored: { gi: number; score: number; why: string[] }[] = [];
  const wantSources = Math.min(3, s.tables.length);
  for (let gi = 0; gi < s.golden.length; gi++) {
    const g = s.golden[gi];
    if (g.members.length < Math.min(3, wantSources + 1) || g.sources.length < wantSources) continue;
    const d = describe(ctx, gi);
    if (d.why.length < 2) continue;
    scored.push({ gi, ...d });
  }
  scored.sort((x, y) => y.score - x.score || x.gi - y.gi);
  const out: FeaturedCluster[] = [];
  const usedWhy = new Set<string>();
  const usedCountry = new Set<string>();
  const taken = new Set<number>();
  const take = (c: (typeof scored)[number]) => {
    const g = s.golden[c.gi];
    usedWhy.add(c.why[0].split(":")[0]);
    usedCountry.add(s.recs[g.members[0]].country);
    taken.add(c.gi);
    out.push({ golden: c.gi, anchor: g.members[0], id: g.id, name: g.values.name?.value ?? g.id, records: g.members.length, sources: g.sources, why: c.why.slice(0, 3).join(" · ") });
  };
  // first pass: vary what the examples show and where the customers live; second pass: best of the rest
  for (const c of scored) {
    if (out.length >= 6) break;
    const lead = c.why[0].split(":")[0];
    const country = s.recs[s.golden[c.gi].members[0]].country;
    if (usedWhy.has(lead) || (usedCountry.has(country) && usedCountry.size < 5) || !pure(c.gi)) continue;
    take(c);
  }
  for (const c of scored) {
    if (out.length >= 8) break;
    if (!taken.has(c.gi) && pure(c.gi)) take(c);
  }
  // uploaded files rarely look like the demo: fall back to the largest merges
  if (out.length < 3) {
    const taken = new Set(out.map((o) => o.golden));
    const big = s.golden
      .map((g, gi) => ({ g, gi }))
      .filter(({ g, gi }) => g.members.length > 1 && !taken.has(gi))
      .sort((x, y) => y.g.members.length - x.g.members.length || x.gi - y.gi)
      .slice(0, 6 - out.length);
    for (const { g, gi } of big) out.push({ golden: gi, anchor: g.members[0], id: g.id, name: g.values.name?.value ?? g.id, records: g.members.length, sources: g.sources, why: `${g.members.length} records merged` });
  }
  if (!out.length && s.golden.length) out.push({ golden: 0, anchor: s.golden[0].members[0], id: s.golden[0].id, name: s.golden[0].values.name?.value ?? s.golden[0].id, records: s.golden[0].members.length, sources: s.golden[0].sources, why: "single record" });
  return out;
}

export function search(ctx: Ctx, query: string): FeaturedCluster[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: FeaturedCluster[] = [];
  for (let gi = 0; gi < ctx.s.golden.length && out.length < 8; gi++) {
    const g = ctx.s.golden[gi];
    const hay = [g.id, g.values.name?.value, g.values.email?.value, g.values.phone?.value, g.values.company?.value].filter(Boolean).join(" ").toLowerCase();
    if (hay.includes(q)) out.push({ golden: gi, anchor: g.members[0], id: g.id, name: g.values.name?.value ?? g.id, records: g.members.length, sources: g.sources, why: `${g.members.length} records` });
  }
  return out;
}

export function beforeAfter(ctx: Ctx, records: number[]): BeforeAfterView {
  const s = ctx.s;
  const goldens = [...new Set(records.map((r) => s.goldenOfRec[r]).filter((g) => g >= 0))];
  const before = s.tables.map((t) => ({
    source: t.source,
    columns: t.columns,
    rows: goldens.flatMap((gi) =>
      s.golden[gi].members
        .filter((i) => s.recs[i].source === t.source)
        .map((i) => ({ rec: i, golden: gi, cells: t.rows[s.recs[i].row] })),
    ),
  }));
  const rows = goldens.map((gi) => ({ golden: gi, row: goldenRow(s.golden[gi], s.recs) }));
  const columns = rows.length ? Object.keys(rows[0].row) : [];
  return { before, after: { columns, rows: rows.map((r) => ({ golden: r.golden, cells: columns.map((c) => r.row[c]) })) } };
}

// ------------------------------------------------------------------ inspector tabs

export function profile(ctx: Ctx): ProfileView[] {
  const s = ctx.s;
  return s.tables.map((t) => {
    const m = s.mappings.get(t.source) ?? [];
    return {
      source: t.source,
      label: t.label,
      columns: (s.profiles.get(t.source) ?? []).map((p) => ({
        name: p.name,
        index: p.index,
        type: p.type,
        typeShare: round(p.typeShare, 3),
        rows: p.rows,
        nulls: p.nulls,
        nullTokens: p.nullTokens,
        distinct: p.distinct,
        distinctHll: p.distinctHll,
        hllError: round(p.hllError, 4),
        masks: p.masks.slice(0, 3),
        top: p.top.slice(0, 4).map((x) => ({ value: x.value.length > 40 ? x.value.slice(0, 39) + "…" : x.value, count: x.count })),
        field: m.find((c) => c.index === p.index)?.field ?? null,
      })),
    };
  });
}

function piiScores(ctx: Ctx) {
  if (!ctx.truth) return null;
  if (!ctx.cache.pii) {
    const v = piiScore(ctx.s, ctx.truth, true).overall;
    const r = piiScore(ctx.s, ctx.truth, false).overall;
    ctx.cache.pii = { precision: round(v.precision), recall: round(v.recall), regexPrecision: round(r.precision), regexRecall: round(r.recall) };
  }
  return ctx.cache.pii;
}

export function pii(ctx: Ctx): PiiView {
  const s = ctx.s;
  const byType = Object.fromEntries(PII_TYPES.map((t) => [t, 0])) as Record<PiiType, number>;
  for (const c of s.piiCells) for (const sp of c.spans) byType[sp.type]++;
  // samples: free-text cells, the ones holding the most kinds of PII first
  const cells = [...s.redacted.entries()]
    .map(([key, segments]) => {
      const [source, row, col] = key.split(":");
      return { source, row: Number(row), col: Number(col), segments, kinds: new Set(segments.filter((x) => x.type).map((x) => x.type)).size };
    })
    .sort((a, b) => b.kinds - a.kinds || a.source.localeCompare(b.source) || a.row - b.row)
    .slice(0, 14);
  return {
    policy: s.policy,
    tokens: s.tokenCount,
    byType,
    columns: s.piiColumns.map((c) => ({ source: c.source, column: c.column, cells: c.cells, byType: c.byType, embedded: c.embedded })),
    samples: cells.map((c) => ({ source: c.source, row: c.row, column: s.tableBySource.get(c.source)!.columns[c.col], segments: c.segments })),
    score: piiScores(ctx),
  };
}

export function mapping(ctx: Ctx): MappingView {
  const s = ctx.s;
  const generated = "in your browser";
  const sources = s.tables.map((t) => ({ id: t.source, name: t.name, mapping: s.mappings.get(t.source) ?? [] }));
  return {
    sources: s.tables.map((t) => ({
      id: t.source,
      label: t.label,
      name: t.name,
      columns: (s.mappings.get(t.source) ?? []).map((m) => {
        const sample: string[] = [];
        for (const row of t.rows) {
          const v = (row[m.index] ?? "").trim();
          if (v && !sample.includes(v)) sample.push(v.length > 34 ? v.slice(0, 33) + "…" : v);
          if (sample.length >= 3) break;
        }
        return {
          column: m.column,
          field: m.field,
          confidence: round(m.confidence, 3),
          name: round(m.name, 3),
          value: round(m.value, 3),
          overridden: !!m.overridden,
          candidates: m.candidates.slice(0, 3).map((c) => ({ field: c.field, score: c.score })),
          sample,
          truth: ctx.truth ? (ctx.truth.mapping[t.source]?.[m.column] ?? null) : undefined,
        };
      }),
    })),
    fields: FIELDS.map((f) => ({ key: f.key, label: f.label, expects: f.expects })),
    yaml: toYaml(sources, generated),
    sql: toSql(sources, generated),
    accuracy: ctx.truth ? round(mappingScore(s, ctx.truth).accuracy) : null,
  };
}

export function review(ctx: Ctx, offset: number, limit: number): ReviewView {
  const s = ctx.s;
  const lb = labels(ctx);
  const queue = s.clustering.review;
  return {
    total: queue.length + s.decisions.size,
    pending: queue.length,
    decided: s.decisions.size,
    items: queue.slice(offset, offset + limit).map((p) => ({
      edge: edgeView(ctx, p),
      a: recordView(ctx, s.er.pairs.a[p]),
      b: recordView(ctx, s.er.pairs.b[p]),
      truth: lb ? lb[s.er.pairs.a[p]] === lb[s.er.pairs.b[p]] : null,
    })),
    score: score(ctx),
  };
}

export function resolveFromTruth(ctx: Ctx) {
  const lb = labels(ctx);
  if (!lb) return;
  ctx.s.decisions = oracleDecisions(ctx.s, lb);
  ctx.s.recluster();
}

export function model(ctx: Ctx): ModelView {
  const s = ctx.s;
  const m = s.er.model;
  const w = s.er.pairs.weight;
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of w) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  const from = Math.floor(Math.max(lo, -40));
  const width = 1;
  const n = Math.max(1, Math.ceil(Math.min(hi, 60) - from) + 1);
  const bins = new Array<number>(n).fill(0);
  const lb = labels(ctx);
  const truthMatch = lb ? new Array<number>(n).fill(0) : null;
  for (let p = 0; p < w.length; p++) {
    const k = Math.min(n - 1, Math.max(0, Math.floor((w[p] - from) / width)));
    bins[k]++;
    if (truthMatch && lb![s.er.pairs.a[p]] === lb![s.er.pairs.b[p]]) truthMatch[k]++;
  }
  let vetoed = 0;
  for (const v of s.er.pairs.veto) if (v) vetoed++;
  return {
    comparators: m.comparators.map((c, k) => ({ key: c.key, label: c.label, levels: c.levels, m: m.params.m[k].map((x) => round(x)), u: m.params.u[k].map((x) => round(x, 6)), weights: m.weights[k].map((x) => round(x, 2)) })),
    em: { iterations: m.iterations, converged: m.converged, logLik: m.logLik.map((x) => round(x, 1)), patterns: m.patterns, blockedLambda: round(m.blockedLambda), lambda: m.lambda, prior: round(m.prior, 2), uSample: m.uSample },
    blocking: { rules: s.er.blocking.rules, candidates: s.er.blocking.candidates, totalPairs: s.er.blocking.totalPairs, reductionRatio: s.er.blocking.reductionRatio, maxBlock: s.er.blocking.maxBlock },
    histogram: { bins, from, width, truthMatch },
    tfAdjusted: s.er.tfAdjusted,
    vetoed,
  };
}

export function contracts(ctx: Ctx): ContractsView {
  const s = ctx.s;
  const recLabel = (i: number) => {
    const r = s.recs[i];
    return `${r.source} line ${s.tableBySource.get(r.source)!.lines[r.row]}`;
  };
  const results = [...s.recordContracts, ...s.clusterContracts, ...s.goldenContracts].map((r) => ({
    id: r.id,
    description: r.description,
    scope: r.scope,
    severity: r.severity,
    checked: r.checked,
    passed: r.passed,
    failed: r.failed,
    samples: r.samples.map((x) => ({
      label: r.scope === "record" ? recLabel(x.index) : r.scope === "cluster" ? (s.golden.find((g) => g.cluster === x.index)?.id ?? `cluster ${x.index}`) : (s.golden[x.index]?.id ?? String(x.index)),
      value: x.value,
    })),
  }));
  const quarantine = [...s.quarantine.entries()].slice(0, 60).map(([i, reasons]) => {
    const r = s.recs[i];
    const t = s.tableBySource.get(r.source)!;
    const preview = t.rows[r.row]
      .filter((v) => v.trim())
      .slice(0, 5)
      .join(" · ");
    return { rec: i, source: r.source, row: r.row, line: t.lines[r.row], reasons, preview: preview.length > 120 ? preview.slice(0, 119) + "…" : preview };
  });
  return { results, quarantine, yaml: contractsYaml() };
}

export function goldenTable(ctx: Ctx, offset: number, limit: number, query: string): GoldenTableView {
  const rows = ctx.s.goldenRows();
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const q = query.trim().toLowerCase();
  const hits: number[] = [];
  rows.forEach((r, i) => {
    if (!q || Object.values(r).some((v) => v !== null && String(v).toLowerCase().includes(q))) hits.push(i);
  });
  return {
    total: rows.length,
    matching: hits.length,
    columns,
    rows: hits.slice(offset, offset + limit).map((i) => ({ index: i, values: columns.map((c) => rows[i][c]) })),
  };
}

export function setRule(ctx: Ctx, field: GoldenKey, rule: SurvivorRule) {
  const spec = GOLDEN_FIELDS.find((g) => g.key === field);
  if (!spec || !spec.rules.includes(rule)) throw new Error(`${RULE_LABEL[rule] ?? rule} is not a rule for ${field}`);
  ctx.s.setSurvivorship({ ...ctx.s.survivorship, rules: { ...ctx.s.survivorship.rules, [field]: rule } });
  invalidate(ctx, "clusters");
}

// ------------------------------------------------------------------ exports and SQL

export async function exportText(ctx: Ctx, what: ExportKind): Promise<{ name: string; mime: string; text: string }> {
  const s = ctx.s;
  const sources = s.tables.map((t) => ({ id: t.source, name: t.name, mapping: s.mappings.get(t.source) ?? [] }));
  const stamp = new Date().toISOString().slice(0, 10);
  switch (what) {
    case "mapping-yaml":
      return { name: "onboard-mapping.yaml", mime: "text/yaml", text: toYaml(sources, stamp) };
    case "mapping-sql":
      return { name: "onboard-staging-views.sql", mime: "text/plain", text: toSql(sources, stamp) };
    case "contracts-yaml":
      return { name: "onboard-contracts.yaml", mime: "text/yaml", text: contractsYaml() + "\n" };
    case "golden-csv": {
      // the PII policy applies on the way out: emails tokenized, phones and birth dates masked, by default
      const rows = s.goldenRows();
      const columns = rows.length ? Object.keys(rows[0]) : [];
      const piiOf: Record<string, PiiType> = { email: "email", phone: "phone", date_of_birth: "dob" };
      const spans = rows.flatMap((r) =>
        Object.entries(piiOf)
          .filter(([c]) => r[c])
          .map(([c, type]) => ({ type, value: String(r[c]), start: 0, end: String(r[c]).length })),
      );
      const tokens = await tokenize(spans, s.policy, s.tokenizer);
      const cell = (c: string, v: string | number | null) => {
        if (v === null) return "";
        const type = piiOf[c];
        if (!type) return String(v);
        const action = s.policy[type];
        return action === "keep" ? String(v) : action === "mask" ? mask(type, String(v)) : (tokens.get(`${type}:${v}`) ?? mask(type, String(v)));
      };
      const text = toCsv([columns, ...rows.map((r) => columns.map((c) => cell(c, r[c])))], { delimiter: ",", eol: "\n" });
      return { name: "onboard-golden-customers.csv", mime: "text/csv", text };
    }
  }
}

function sqlTables(ctx: Ctx): Map<string, SqlTable> {
  if (ctx.cache.sql) return ctx.cache.sql;
  const s = ctx.s;
  const customers = s.goldenRows() as Row[];
  const recCols = ["record_id", "source", "line", "source_id", "first_name", "last_name", "email", "phone", "company", "street", "city", "postcode", "country", "date_of_birth", "created_at", "updated_at", "balance", "currency", "balance_eur", "golden_id", "quarantined"];
  const v = (x: string) => (x === "" ? null : x);
  const records: Row[] = s.recs.map((r: Rec) => ({
    record_id: r.i,
    source: r.source,
    line: s.tableBySource.get(r.source)!.lines[r.row],
    source_id: v(r.sourceId),
    first_name: v(r.first),
    last_name: v(r.last),
    email: v(r.email),
    phone: v(r.phone),
    company: v(r.company),
    street: v(r.street),
    city: v(r.city),
    postcode: v(r.postcode),
    country: v(r.country),
    date_of_birth: v(r.dob),
    created_at: v(r.created),
    updated_at: v(r.updated),
    balance: r.balance,
    currency: v(r.currency),
    balance_eur: r.balanceBase,
    golden_id: s.goldenOfRec[r.i] >= 0 ? s.golden[s.goldenOfRec[r.i]].id : null,
    quarantined: s.quarantine.has(r.i) ? s.quarantine.get(r.i)!.join(", ") : null,
  }));
  const pairs: Row[] = [];
  for (let p = 0; p < s.er.pairs.prob.length; p++) {
    const e = edgeView(ctx, p);
    pairs.push({ pair_id: p, record_a: e.a, record_b: e.b, probability: Math.round(e.prob * 1e6) / 1e6, weight: e.weight, status: e.status, guard: e.veto.join(", ") || null });
  }
  const tables = new Map<string, SqlTable>([
    ["customers", { name: "customers", description: "the golden table, one row per customer", columns: customers.length ? Object.keys(customers[0]) : [], rows: customers }],
    ["records", { name: "records", description: "every source record after normalization", columns: recCols, rows: records }],
    ["pairs", { name: "pairs", description: "candidate pairs from blocking, with match probability", columns: ["pair_id", "record_a", "record_b", "probability", "weight", "status", "guard"], rows: pairs }],
  ]);
  return (ctx.cache.sql = tables);
}

export function sqlSchema(ctx: Ctx): SqlSchema {
  return { tables: [...sqlTables(ctx).values()].map((t) => ({ name: t.name, description: t.description ?? "", rows: t.rows.length, columns: t.columns })) };
}

export function sql(ctx: Ctx, query: string): SqlView {
  const r = runSql(query, sqlTables(ctx));
  return { columns: r.columns, rows: r.rows.slice(0, 500), total: r.total, scanned: r.scanned, ms: r.ms };
}
