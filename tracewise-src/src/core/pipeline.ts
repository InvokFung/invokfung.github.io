// The streaming pipeline. Spans arrive as they end; each trace is held until
// its root has ended plus a decision wait, then assembled once and used
// three ways: RED metrics (from every trace, before sampling), the service
// map, and the tail sampler's keep/drop decision. Every simulated minute the
// metrics are closed, the detectors and SLO burn rates are updated, alerts
// fire or resolve, and an open incident is re-ranked.

import { RateDetector, SeriesDetector, type DetectorOptions, type DetectorStep, type RateDetectorOptions } from "./anomaly";
import { rankRootCauses, type RcaResult } from "./rca";
import { DEFAULT_SAMPLER, TailSampler, type KeepReason, type SamplerOptions } from "./sampler";
import { DDSketch } from "./sketch";
import { PAGE_RULES, SloTracker, type BurnRule } from "./slo";
import { buildTree, entries, type TraceTree } from "./tracetree";
import { Kind, Status, type Span } from "./types";

export const MINUTE_MS = 60_000;

export interface FlowConfig {
  id: string;
  /** The node that serves the flow (the root span's service). */
  root: string;
  /** Requests slower than this are bad for the SLO. */
  sloMs: number;
  async: boolean;
}

export interface PipelineOptions {
  /** How long after a trace's root ends before it is assembled and decided. */
  decisionWaitMs: number;
  /** Traces whose root never arrives are assembled this long after their first span. */
  orphanWaitMs: number;
  sampler: SamplerOptions;
  /** Kept traces held in memory. */
  storeLimit: number;
  /** Minutes of history kept. */
  historyMin: number;
  sloTarget: number;
  burnRules: BurnRule[];
  /** Maps a root span to its flow id. */
  flowOf: (root: Span) => string | null;
  /** Maps a CONSUMER span to its asynchronous flow id. */
  asyncFlowOf: (s: Span) => string | null;
  flows: FlowConfig[];
  /** Minutes before detectors may alert. */
  warmupMin: number;
  /** Latency alerts also need p95 at least this many times its baseline. */
  minLatencyRatio: number;
  /** Error alerts also need the error ratio this far (absolute) above baseline. */
  minErrorDelta: number;
  /** Quiet minutes before an incident closes. */
  closeAfterMin: number;
  /** Consecutive calm minutes before an alert resolves. */
  resolveAfterMin: number;
  /** Called with every assembled trace (for evaluation). */
  onTrace?: (t: AssembledTrace) => void;
  /** Settings for the flow detectors that raise alerts. */
  detectors: { latency: DetectorOptions; errors: RateDetectorOptions };
}

export interface NodeMinute {
  n: number;
  err: number;
  /** Errors that started at this node. */
  own: number;
  selfMean: number;
  selfP95: number;
  durP50: number;
  durP95: number;
  durP99: number;
  /** Requests by service.version, when versions are reported. */
  versions?: Record<string, number>;
}

export interface EdgeMinute {
  n: number;
  err: number;
  p95: number;
}

export interface Detection {
  z: number;
  s: number;
  alarm: boolean;
}

export interface FlowMinute {
  n: number;
  err: number;
  good: number;
  p50: number;
  p95: number;
  p99: number;
  /** Ordinary (not error, not slow) traces seen and kept, for sampling weights. */
  restSeen: number;
  restKept: number;
  lat: Detection;
  errs: Detection;
  /** Burn rate per rule: [long window, short window]. */
  burn: [number, number][];
}

export interface MinuteSummary {
  minute: number;
  traces: number;
  spans: number;
  nodes: Record<string, NodeMinute>;
  edges: Record<string, EdgeMinute>;
  flows: Record<string, FlowMinute>;
}

export type AlertKind = "fast-burn" | "slow-burn" | "latency" | "errors";

export interface Alert {
  id: number;
  flow: string;
  kind: AlertKind;
  minute: number;
  firedAt: number;
  resolvedAt?: number;
  /** Change-point estimate (minute) behind a detector alert. */
  onset?: number;
  detail: string;
}

export interface Incident {
  id: number;
  flow: string;
  openedAt: number;
  openedMinute: number;
  onsetMinute: number;
  closedAt?: number;
  alerts: Alert[];
  rca: RcaResult | null;
  /** The top candidates after each re-rank. */
  ranks: { minute: number; top: string[] }[];
}

export interface StoredTrace {
  traceId: string;
  flow: string;
  minute: number;
  startNs: number;
  durMs: number;
  error: boolean;
  reason: KeepReason;
  partial: boolean;
  spans: Span[];
}

export interface AssembledTrace {
  tree: TraceTree;
  flow: string | null;
  minute: number;
  durMs: number;
  error: boolean;
  kept: KeepReason | null;
  fragment: boolean;
}

export interface PipelineEvent {
  type: "alert" | "resolve" | "open" | "close" | "rank";
  minute: number;
  alert?: Alert;
  incident?: Incident;
}

interface Pending {
  spans: Span[];
  rootEndMs: number;
  firstMs: number;
  lastMs: number;
  fragment: boolean;
  done: boolean;
}

interface NodeAcc {
  n: number;
  err: number;
  own: number;
  self: DDSketch;
  dur: DDSketch;
  versions: Map<string, number>;
}

interface Bucket {
  minute: number;
  traces: number;
  spans: number;
  nodes: Map<string, NodeAcc>;
  edges: Map<string, { n: number; err: number; dur: DDSketch }>;
  flows: Map<string, { n: number; err: number; good: number; dur: DDSketch; restSeen: number; restKept: number }>;
}

export interface LiveCounts {
  spans: number;
  traces: number;
  nodes: Record<string, { n: number; err: number; selfMs: number }>;
  edges: Record<string, { n: number; err: number }>;
}

interface FlowState {
  cfg: FlowConfig;
  lat: SeriesDetector;
  err: RateDetector;
  slo: SloTracker;
  active: Map<AlertKind, Alert>;
}

interface NodeState {
  lat: SeriesDetector;
  err: RateDetector;
}

/** Detector on log p95 latency per minute. */
export const LATENCY_DETECTOR: DetectorOptions = { halfLife: 10, window: 30, warmup: 10, minScale: 0.05, gate: 3, cusum: { k: 0.75, h: 6, cap: 4, ceiling: 16 } };
/** Detector on the error ratio per minute. */
export const ERROR_DETECTOR: RateDetectorOptions = { halfLife: 15, warmup: 10, floor: 0.002, gate: 3, cusum: { k: 1, h: 6, cap: 4, ceiling: 16 } };
const latencyDetector = () => new SeriesDetector(LATENCY_DETECTOR);
const errorDetector = () => new RateDetector(ERROR_DETECTOR);

export class Pipeline {
  readonly opts: PipelineOptions;
  readonly sampler: TailSampler;
  readonly history: MinuteSummary[] = [];
  readonly store: StoredTrace[] = [];
  readonly alerts: Alert[] = [];
  readonly incidents: Incident[] = [];
  /** First minute not yet closed. */
  openMinute = 0;
  spansIn = 0;
  tracesIn = 0;
  lateSpans = 0;
  errorTraces = 0;
  errorKept = 0;

  private pending = new Map<string, Pending>();
  private rootQ: { id: string; due: number }[] = [];
  private orphanQ: { id: string; due: number }[] = [];
  private fragQ: { id: string; due: number }[] = [];
  private qHead = { root: 0, orphan: 0, frag: 0 };
  /** Recently assembled traces, so late spans can find their decision. */
  private recent = new Map<string, { kept: StoredTrace | null; error: boolean }>();
  private recentQ: { id: string; until: number }[] = [];
  private recentHead = 0;
  private buckets = new Map<number, Bucket>();
  private flowState = new Map<string, FlowState>();
  private nodeState = new Map<string, NodeState>();
  private live: LiveCounts = emptyLive();
  private nextAlertId = 1;
  private nextIncidentId = 1;
  private quiet = 0;
  /** Calm minutes so far, by alert id. */
  private calm = new Map<number, number>();

  constructor(opts: PipelineOptions) {
    this.opts = opts;
    this.sampler = new TailSampler(opts.sampler);
    for (const f of opts.flows)
      this.flowState.set(f.id, {
        cfg: f,
        lat: new SeriesDetector(opts.detectors.latency),
        err: new RateDetector(opts.detectors.errors),
        slo: new SloTracker(opts.sloTarget, opts.burnRules),
        active: new Map(),
      });
  }

  get openIncident(): Incident | null {
    const last = this.incidents[this.incidents.length - 1];
    return last && last.closedAt === undefined ? last : null;
  }

  // ------------------------------------------------------------ ingest

  ingest(s: Span): void {
    this.spansIn++;
    const endMs = s.endNs / 1e6;
    let p = this.pending.get(s.traceId);
    if (!p) {
      const r = this.recent.get(s.traceId);
      if (r) {
        // The trace was already decided: start (or extend) a late fragment.
        this.lateSpans++;
        p = { spans: [], rootEndMs: -1, firstMs: endMs, lastMs: endMs, fragment: true, done: false };
        this.pending.set(s.traceId, p);
      } else {
        p = { spans: [], rootEndMs: -1, firstMs: endMs, lastMs: endMs, fragment: false, done: false };
        this.pending.set(s.traceId, p);
        this.orphanQ.push({ id: s.traceId, due: endMs + this.opts.orphanWaitMs });
      }
    } else if (p.fragment) this.lateSpans++;
    p.spans.push(s);
    p.lastMs = endMs;
    if (p.fragment) this.fragQ.push({ id: s.traceId, due: endMs + this.opts.decisionWaitMs });
    else if (!s.parentSpanId) {
      p.rootEndMs = endMs;
      this.rootQ.push({ id: s.traceId, due: endMs + this.opts.decisionWaitMs });
    }
  }

  /** Move the watermark to `nowMs`: assemble due traces and close finished minutes. */
  advance(nowMs: number): PipelineEvent[] {
    const events: PipelineEvent[] = [];
    for (;;) {
      const close = (this.openMinute + 1) * MINUTE_MS + this.opts.decisionWaitMs;
      if (close > nowMs) break;
      this.assembleDue(close);
      events.push(...this.closeMinute(close));
    }
    this.assembleDue(nowMs);
    return events;
  }

  private assembleDue(t: number): void {
    // Roots end in time order, so each queue is ordered by due time.
    for (;;) {
      const a = this.rootQ[this.qHead.root];
      const b = this.orphanQ[this.qHead.orphan];
      const c = this.fragQ[this.qHead.frag];
      const ta = a && a.due <= t ? a.due : Infinity;
      const tb = b && b.due <= t ? b.due : Infinity;
      const tc = c && c.due <= t ? c.due : Infinity;
      const m = Math.min(ta, tb, tc);
      if (m === Infinity) break;
      if (m === ta) {
        this.qHead.root++;
        this.assemble(a.id, a.due, false);
      } else if (m === tb) {
        this.qHead.orphan++;
        this.assemble(b.id, b.due, true);
      } else {
        this.qHead.frag++;
        const p = this.pending.get(c.id);
        // Only the newest queue entry of a fragment counts.
        if (p && p.fragment && c.due >= p.lastMs + this.opts.decisionWaitMs) this.assemble(c.id, c.due, false);
      }
    }
    for (const k of ["root", "orphan", "frag"] as const) {
      const q = k === "root" ? this.rootQ : k === "orphan" ? this.orphanQ : this.fragQ;
      if (this.qHead[k] > 4096) {
        q.splice(0, this.qHead[k]);
        this.qHead[k] = 0;
      }
    }
    while (this.recentHead < this.recentQ.length && this.recentQ[this.recentHead].until <= t) this.recent.delete(this.recentQ[this.recentHead++].id);
    if (this.recentHead > 4096) {
      this.recentQ.splice(0, this.recentHead);
      this.recentHead = 0;
    }
  }

  private bucket(minute: number): Bucket {
    const m = Math.max(minute, this.openMinute);
    let b = this.buckets.get(m);
    if (!b) this.buckets.set(m, (b = { minute: m, traces: 0, spans: 0, nodes: new Map(), edges: new Map(), flows: new Map() }));
    return b;
  }

  private assemble(id: string, dueMs: number, orphanTimer: boolean): void {
    const p = this.pending.get(id);
    if (!p || p.done) return;
    if (orphanTimer && p.rootEndMs >= 0) return; // its root arrived; the root timer handles it
    p.done = true;
    this.pending.delete(id);
    const tree = buildTree(p.spans);
    const root = tree.root.span;
    const complete = !p.fragment && !root.parentSpanId;
    const endMs = complete ? root.endNs / 1e6 : p.lastMs;
    const b = this.bucket(Math.floor(endMs / MINUTE_MS));
    b.traces++;
    b.spans += p.spans.length;
    this.live.spans += p.spans.length;
    this.live.traces++;
    if (!p.fragment) this.tracesIn++;

    // RED metrics from every trace, before sampling.
    const hasError = p.spans.some((s) => s.status === Status.ERROR);
    for (const e of entries(tree)) {
      let acc = b.nodes.get(e.node);
      if (!acc) b.nodes.set(e.node, (acc = { n: 0, err: 0, own: 0, self: new DDSketch(), dur: new DDSketch(), versions: new Map() }));
      const selfMs = e.selfNs / 1e6 + (e.span.span.kind === Kind.CONSUMER ? consumerWaitMs(e.span.span) : 0);
      const durMs = e.durNs / 1e6;
      acc.n++;
      if (e.error) acc.err++;
      if (e.ownError) acc.own++;
      acc.self.add(selfMs);
      acc.dur.add(durMs);
      if (e.version) acc.versions.set(e.version, (acc.versions.get(e.version) ?? 0) + 1);
      const ln = (this.live.nodes[e.node] ??= { n: 0, err: 0, selfMs: 0 });
      ln.n++;
      ln.selfMs += selfMs;
      if (e.error) ln.err++;
      if (e.parentNode !== null) {
        const key = `${e.parentNode}>${e.node}`;
        let ed = b.edges.get(key);
        if (!ed) b.edges.set(key, (ed = { n: 0, err: 0, dur: new DDSketch() }));
        ed.n++;
        if (e.error) ed.err++;
        ed.dur.add(durMs);
        const le = (this.live.edges[key] ??= { n: 0, err: 0 });
        le.n++;
        if (e.error) le.err++;
      }
      // Asynchronous flows are measured by delivery lag.
      if (e.span.span.kind === Kind.CONSUMER) {
        const fid = this.opts.asyncFlowOf(e.span.span);
        const cfg = fid ? this.flowState.get(fid)?.cfg : undefined;
        if (cfg) {
          const lag = durMs + consumerWaitMs(e.span.span);
          const fl = flowAcc(b, cfg.id);
          fl.n++;
          if (e.error) fl.err++;
          if (!e.error && lag <= cfg.sloMs) fl.good++;
          fl.dur.add(lag);
        }
      }
    }

    // Root flow metrics and the sampling decision.
    let flow: string | null = null;
    let kept: KeepReason | null = null;
    const durMs = (root.endNs - root.startNs) / 1e6;
    const rootError = root.status === Status.ERROR;
    const prev = this.recent.get(id);
    if (complete) {
      flow = this.opts.flowOf(root);
      const cfg = flow ? this.flowState.get(flow)?.cfg : undefined;
      if (cfg && flow) {
        const fl = flowAcc(b, flow);
        fl.n++;
        if (rootError) fl.err++;
        if (!rootError && durMs <= cfg.sloMs) fl.good++;
        fl.dur.add(durMs);
      }
      kept = this.sampler.decide(flow ?? root.name, durMs, hasError, dueMs);
      if (flow) {
        const fl = flowAcc(b, flow);
        if (!hasError && kept !== "slow") {
          fl.restSeen++;
          if (kept === "sampled") fl.restKept++;
        }
      }
      if (hasError) this.errorTraces++;
      if (hasError && kept) this.errorKept++;
    } else if (prev) {
      // A late fragment follows its trace's decision; a late error is kept regardless.
      if (prev.kept) {
        prev.kept.spans.push(...p.spans);
        kept = prev.kept.reason;
        if (hasError && !prev.error) {
          this.errorTraces++;
          this.errorKept++;
          prev.kept.error = true;
        }
      } else if (hasError) {
        kept = "error";
        if (!prev.error) {
          this.errorTraces++;
          this.errorKept++;
        }
      }
      prev.error ||= hasError;
    } else {
      // An orphan whose root never arrived: decide it like a trace.
      kept = this.sampler.decide(root.name, durMs, hasError, dueMs);
      if (hasError) this.errorTraces++;
      if (hasError && kept) this.errorKept++;
    }

    let stored: StoredTrace | null = null;
    if (kept && !(prev && prev.kept)) {
      stored = {
        traceId: id,
        flow: flow ?? root.name,
        minute: b.minute,
        startNs: tree.startNs,
        durMs,
        error: hasError,
        reason: kept,
        partial: !complete,
        spans: p.spans,
      };
      this.store.push(stored);
      if (this.store.length > this.opts.storeLimit) this.store.splice(0, this.store.length - this.opts.storeLimit);
    }
    if (!prev) {
      this.recent.set(id, { kept: stored, error: hasError });
      this.recentQ.push({ id, until: dueMs + 120_000 });
    } else if (stored && !prev.kept) prev.kept = stored; // later fragments join this one
    this.opts.onTrace?.({ tree, flow, minute: b.minute, durMs, error: hasError, kept, fragment: p.fragment });
  }

  // ------------------------------------------------------------ minutes

  private closeMinute(atMs: number): PipelineEvent[] {
    const m = this.openMinute;
    const b = this.bucket(m);
    this.buckets.delete(m);
    this.openMinute = m + 1;
    this.sampler.roll();
    const sum: MinuteSummary = { minute: m, traces: b.traces, spans: b.spans, nodes: {}, edges: {}, flows: {} };
    for (const [id, a] of b.nodes) {
      sum.nodes[id] = {
        n: a.n,
        err: a.err,
        own: a.own,
        selfMean: a.self.mean,
        selfP95: a.self.quantile(0.95),
        durP50: a.dur.quantile(0.5),
        durP95: a.dur.quantile(0.95),
        durP99: a.dur.quantile(0.99),
        versions: a.versions.size ? Object.fromEntries(a.versions) : undefined,
      };
    }
    for (const [k, e] of b.edges) sum.edges[k] = { n: e.n, err: e.err, p95: e.dur.quantile(0.95) };

    const events: PipelineEvent[] = [];
    const warm = m >= this.opts.warmupMin;
    let anyOn = false;
    for (const [fid, fs] of this.flowState) {
      const a = b.flows.get(fid);
      const n = a?.n ?? 0;
      const p95 = a && n ? a.dur.quantile(0.95) : NaN;
      // A thin minute still advances the detector, so its onset index stays a minute number.
      const lat = n >= 5 ? fs.lat.update(Math.log(p95)) : quiet(fs.lat.update(NaN));
      const err = fs.err.update(a?.err ?? 0, n);
      fs.slo.push(a?.good ?? 0, n);
      const rules = fs.slo.evaluate();
      sum.flows[fid] = {
        n,
        err: a?.err ?? 0,
        good: a?.good ?? 0,
        p50: a && n ? a.dur.quantile(0.5) : NaN,
        p95,
        p99: a && n ? a.dur.quantile(0.99) : NaN,
        restSeen: a?.restSeen ?? 0,
        restKept: a?.restKept ?? 0,
        lat: { z: lat.z, s: lat.s, alarm: lat.alarm },
        errs: { z: err.z, s: err.s, alarm: err.alarm },
        burn: rules.map((r) => [r.long, r.short]),
      };
      if (!warm) continue;
      const ratio = n ? (a?.err ?? 0) / n : 0;
      const latExcess = n >= 5 ? Math.log(p95) - lat.forecast : 0;
      const errExcess = ratio - err.forecast;
      const want: [AlertKind, boolean, boolean, string, number?][] = [
        ["fast-burn", rules[0]?.firing ?? false, !rules[0] || rules[0].short < rules[0].rule.factor, `burn ${rules[0]?.long.toFixed(1)}x over 1h and ${rules[0]?.short.toFixed(1)}x over 5m`],
        ["slow-burn", rules[1]?.firing ?? false, !rules[1] || rules[1].short < rules[1].rule.factor, `burn ${rules[1]?.long.toFixed(1)}x over 6h and ${rules[1]?.short.toFixed(1)}x over 30m`],
        [
          "latency",
          lat.alarm && latExcess >= Math.log(this.opts.minLatencyRatio),
          lat.z < 3 && latExcess < Math.log(this.opts.minLatencyRatio),
          `p95 ${fmtMs(p95)} vs ${fmtMs(Math.exp(lat.forecast))} expected`,
          lat.onset,
        ],
        ["errors", err.alarm && errExcess >= this.opts.minErrorDelta, err.z < 3 && errExcess < this.opts.minErrorDelta, `errors ${(ratio * 100).toFixed(1)}% vs ${(err.forecast * 100).toFixed(2)}% expected`, err.onset],
      ];
      for (const [kind, on, calm, detail, onset] of want) {
        if (on) anyOn = true;
        const cur = fs.active.get(kind);
        if (on && !cur) {
          const al: Alert = { id: this.nextAlertId++, flow: fid, kind, minute: m, firedAt: atMs, detail, onset: onset !== undefined && onset >= 0 ? onset : undefined };
          fs.active.set(kind, al);
          this.alerts.push(al);
          events.push({ type: "alert", minute: m, alert: al });
        } else if (cur) {
          // Hysteresis: resolve after a run of calm minutes, then re-arm the detector.
          const c = calm ? (this.calm.get(cur.id) ?? 0) + 1 : 0;
          this.calm.set(cur.id, c);
          if (c >= this.opts.resolveAfterMin) {
            cur.resolvedAt = atMs;
            fs.active.delete(kind);
            this.calm.delete(cur.id);
            if (kind === "latency") fs.lat.rearm();
            if (kind === "errors") fs.err.rearm();
            events.push({ type: "resolve", minute: m, alert: cur });
          }
        }
      }
    }

    // Per-node detectors, for map health and live ranking.
    for (const [id, nm] of Object.entries(sum.nodes)) {
      let ns = this.nodeState.get(id);
      if (!ns) this.nodeState.set(id, (ns = { lat: latencyDetector(), err: errorDetector() }));
      ns.lat.update(Math.log(Math.max(nm.selfMean, 1e-3)));
      ns.err.update(nm.own, nm.n);
    }
    this.history.push(sum);
    if (this.history.length > this.opts.historyMin) this.history.shift();

    // Incidents: open on the first alert, re-rank every minute while a signal
    // is still bad (then the ranking stays as it was), close after quiet minutes.
    const firing = [...this.flowState.values()].flatMap((fs) => [...fs.active.values()]);
    let inc = this.openIncident;
    if (firing.length && !inc) {
      const first = firing.reduce((a, x) => (x.id < a.id ? x : a));
      const onsets = firing.map((a) => a.onset).filter((x): x is number => x !== undefined);
      inc = {
        id: this.nextIncidentId++,
        flow: first.flow,
        openedAt: atMs,
        openedMinute: m,
        onsetMinute: onsets.length ? Math.min(...onsets) : Math.max(0, m - 3),
        alerts: [...firing],
        rca: null,
        ranks: [],
      };
      this.incidents.push(inc);
      events.push({ type: "open", minute: m, incident: inc });
    }
    if (inc) {
      for (const a of firing) if (!inc.alerts.includes(a)) inc.alerts.push(a);
      if (firing.length) {
        this.quiet = 0;
        if (anyOn || !inc.rca) {
          inc.rca = this.rank(inc);
          inc.ranks.push({ minute: m, top: inc.rca.ranking.slice(0, 3).map((c) => c.node) });
          events.push({ type: "rank", minute: m, incident: inc });
        }
      } else if (++this.quiet >= this.opts.closeAfterMin) {
        inc.closedAt = atMs;
        this.quiet = 0;
        events.push({ type: "close", minute: m, incident: inc });
      }
    }
    return events;
  }

  /** Rank root causes for an incident from the minutes and kept traces in memory. */
  rank(inc: Incident): RcaResult {
    return rankRootCauses({
      history: this.history,
      store: this.store,
      flow: inc.flow,
      flowRoot: this.flowState.get(inc.flow)?.cfg.root ?? null,
      onsetMinute: inc.onsetMinute,
      nowMinute: this.openMinute - 1,
      flows: this.opts.flows,
    });
  }

  /** Detector state of every node at the last closed minute. */
  nodeHealth(): Record<string, { latZ: number; errZ: number; alarm: boolean }> {
    const out: Record<string, { latZ: number; errZ: number; alarm: boolean }> = {};
    for (const [id, ns] of this.nodeState) out[id] = { latZ: ns.lat.last.z, errZ: ns.err.last.z, alarm: ns.lat.last.alarm || ns.err.last.alarm };
    return out;
  }

  activeAlerts(): Alert[] {
    return [...this.flowState.values()].flatMap((fs) => [...fs.active.values()]);
  }

  /** Counts since the last call, for the live map. */
  takeLive(): LiveCounts {
    const l = this.live;
    this.live = emptyLive();
    return l;
  }
}

function flowAcc(b: Bucket, id: string) {
  let f = b.flows.get(id);
  if (!f) b.flows.set(id, (f = { n: 0, err: 0, good: 0, dur: new DDSketch(), restSeen: 0, restKept: 0 }));
  return f;
}

/** Time a message waited for the consumer: the queue in front of it is the consumer's own. */
function consumerWaitMs(s: Span): number {
  const q = s.attributes["tw.enqueued_ns"];
  return typeof q === "number" ? Math.max(0, (s.startNs - q) / 1e6) : 0;
}

function quiet(last: DetectorStep): DetectorStep {
  return { ...last, alarm: false, z: 0, onset: -1 };
}

function emptyLive(): LiveCounts {
  return { spans: 0, traces: 0, nodes: {}, edges: {} };
}

const fmtMs = (x: number) => (x >= 100 ? `${Math.round(x)} ms` : `${x.toFixed(1)} ms`);

export { DEFAULT_SAMPLER, PAGE_RULES };
