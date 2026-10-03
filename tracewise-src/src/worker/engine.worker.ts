/// <reference lib="webworker" />
// The engine: simulator and pipeline run here, off the page's main thread.
// Simulated time advances at `speed` times real time; the page gets a
// snapshot about ten times a second, a point per closed minute, incident
// updates, and waterfalls on request.

import { analyzeSpans, groupByTrace, waterfall } from "../core/analyze";
import { simPipelineOptions } from "../core/config";
import { parseOtlp, toOtlp } from "../core/otlp";
import { MINUTE_MS, Pipeline, type Incident, type PipelineEvent, type StoredTrace } from "../core/pipeline";
import { traceCriticalPath } from "../core/rca";
import { Simulator, type Fault } from "../core/sim";
import { SERVICES, SERVICE_IDS } from "../core/topology";
import { buildTree, entries } from "../core/tracetree";
import type { Span } from "../core/types";
import type { FaultInput, FaultView, FromWorker, Health, IncidentView, MinutePoint, NodeSnap, ToWorker, TraceSummary, UploadResult } from "./protocol";

const SEED = 7;
const START_HOUR = 9.4;
const WARMUP_MIN = 36;
/** The scripted incident that plays if the visitor has not started one. */
const AUTOPLAY = { service: "payment-provider", kind: "latency" as const, magnitude: 380, afterMin: 3, durationMin: 9 };

const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

const pipe = new Pipeline(simPipelineOptions());
const sim = new Simulator({ seed: SEED, startHour: START_HOUR, onSpan: (s) => pipe.ingest(s) });

let speed = 60;
let visible = true;
let warm = false;
let touched = false;
let lastReal = 0;
let lastSnapReal = 0;
let lastTracesReal = 0;
let lastSnapSim = 0;
const mystery = new Set<number>();
let exemplarId: string | null = null;
const scripted = new Set<number>();

// ------------------------------------------------------------ live node stats

interface Smooth {
  n: number;
  err: number;
  self: number;
  rps: number;
  base: number;
}
const smooth = new Map<string, Smooth>(SERVICE_IDS.map((id) => [id, { n: 0, err: 0, self: 0, rps: 0, base: 0 }]));
let edgeCounts: Record<string, { n: number; err: number }> = {};

function absorbLive(dtMs: number): void {
  const live = pipe.takeLive();
  for (const [k, e] of Object.entries(live.edges)) {
    const c = (edgeCounts[k] ??= { n: 0, err: 0 });
    c.n += e.n;
    c.err += e.err;
  }
  if (dtMs <= 0) return;
  const a = 1 - Math.exp(-dtMs / 20_000);
  const slow = 1 - Math.exp(-dtMs / 900_000);
  for (const [id, s] of smooth) {
    const l = live.nodes[id] ?? { n: 0, err: 0, selfMs: 0 };
    s.n = s.n * (1 - a) + l.n * a;
    s.err = s.err * (1 - a) + l.err * a;
    s.self = s.self * (1 - a) + l.selfMs * a;
    s.rps = s.rps * (1 - a) + (l.n / (dtMs / 1000)) * a;
    const mean = s.n > 1e-9 ? s.self / s.n : 0;
    // The baseline follows the mean slowly, and not while the node is above it.
    if (s.base === 0) s.base = mean;
    else if (mean < s.base * 1.5) s.base = s.base * (1 - slow) + mean * slow;
  }
}

function nodeSnaps(): Record<string, NodeSnap> {
  const health = pipe.nodeHealth();
  const out: Record<string, NodeSnap> = {};
  for (const def of SERVICES) {
    const st = sim.stations.get(def.id)!;
    const s = smooth.get(def.id)!;
    const err = s.n > 1e-9 ? s.err / s.n : 0;
    const selfMs = s.n > 1e-9 ? s.self / s.n : 0;
    const queue = sim.queueLength(def.id);
    const h = health[def.id] ?? { latZ: 0, errZ: 0, alarm: false };
    const ratio = selfMs / Math.max(s.base, 0.05);
    const delta = selfMs - s.base;
    let level: Health = 0;
    if (err >= 0.05 || (ratio >= 3 && delta >= 3) || queue >= 4 * def.workers) level = 2;
    else if (err >= 0.01 || (ratio >= 1.6 && delta >= 1) || queue >= def.workers) level = 1;
    const deploy = sim.activeFaults().find((f) => f.service === def.id && f.kind === "deploy");
    out[def.id] = {
      busy: st.busy,
      workers: st.workers,
      queue,
      rps: s.rps,
      err,
      selfMs,
      baseMs: s.base,
      health: level,
      version: deploy?.version ? `${def.version} → ${deploy.version}` : def.version,
      latZ: h.latZ,
      errZ: h.errZ,
    };
  }
  return out;
}

const faultView = (f: Fault): FaultView => ({
  id: f.id,
  service: f.service,
  kind: f.kind,
  magnitude: f.magnitude,
  startMs: f.startMs,
  endMs: Number.isFinite(f.endMs) ? f.endMs : null,
  version: f.version,
  mystery: mystery.has(f.id),
  scripted: scripted.has(f.id),
});

function snapshot(): void {
  const dt = sim.now - lastSnapSim;
  lastSnapSim = sim.now;
  const inc = pipe.openIncident;
  post({
    type: "snapshot",
    snap: {
      simMs: sim.now,
      hour: sim.hourAt(),
      speed,
      rate: sim.rate(),
      nodes: nodeSnaps(),
      edges: edgeCounts,
      dtMs: dt,
      totals: {
        spans: pipe.spansIn,
        traces: pipe.tracesIn,
        seen: pipe.sampler.seen,
        kept: pipe.sampler.kept,
        errorTraces: pipe.errorTraces,
        errorKept: pipe.errorKept,
        lateSpans: pipe.lateSpans,
        stored: pipe.store.length,
      },
      faults: sim.faults.filter((f) => f.endMs > sim.now - 3 * MINUTE_MS).map(faultView),
      alerts: pipe.activeAlerts(),
      suspects: inc?.rca ? inc.rca.ranking.filter((c) => c.score > 0.05).slice(0, 3).map((c) => c.node) : [],
    },
  });
  edgeCounts = {};
}

// ------------------------------------------------------------ minutes and incidents

function minutePoint(): MinutePoint | null {
  const h = pipe.history[pipe.history.length - 1];
  if (!h) return null;
  const flows: MinutePoint["flows"] = {};
  for (const [id, f] of Object.entries(h.flows))
    flows[id] = { n: f.n, p50: f.p50, p95: f.p95, p99: f.p99, err: f.n ? f.err / f.n : 0, burn: f.burn, latZ: f.lat.z, errZ: f.errs.z };
  return { minute: h.minute, closedMs: sim.now, flows };
}

function incidentView(inc: Incident): IncidentView {
  return {
    id: inc.id,
    flow: inc.flow,
    openedAt: inc.openedAt,
    openedMinute: inc.openedMinute,
    onsetMinute: inc.onsetMinute,
    closedAt: inc.closedAt,
    alerts: inc.alerts.map((a) => ({ id: a.id, kind: a.kind, flow: a.flow, firedAt: a.firedAt, resolvedAt: a.resolvedAt, detail: a.detail })),
    rca: inc.rca,
    ranks: inc.ranks,
    exemplar: exemplar(inc),
  };
}

/** A kept trace from after the onset that shows the top suspect at work: its own error, or the most critical-path time in it. */
function exemplar(inc: Incident): string | undefined {
  const top = inc.rca?.ranking[0];
  if (!top) return undefined;
  const from = inc.onsetMinute * MINUTE_MS * 1e6;
  let best: StoredTrace | null = null;
  let bestV = 0;
  // The store is in decision order, which is close to but not exactly start order.
  for (let i = pipe.store.length - 1, seen = 0; i >= 0 && seen < 300 && i >= pipe.store.length - 2000; i--) {
    const t = pipe.store[i];
    if (t.startNs < from || t.partial) continue;
    seen++;
    let v = traceCriticalPath(t).get(top.node) ?? 0;
    if (t.error && top.ownErrAfter > top.ownErrBefore && entries(buildTree(t.spans)).some((e) => e.node === top.node && e.ownError)) v += 1e6;
    if (t.flow === inc.flow) v *= 1.2;
    if (v > bestV) {
      bestV = v;
      best = t;
    }
  }
  if (best) exemplarId = best.traceId;
  return best?.traceId;
}

function handle(events: PipelineEvent[]): void {
  const had = exemplarId;
  for (const e of events) {
    if ((e.type === "open" || e.type === "rank" || e.type === "close") && e.incident) post({ type: "incident", incident: incidentView(e.incident) });
  }
  // A new exemplar goes into the list at once, so its row and its waterfall arrive together.
  if (warm && exemplarId !== had) post({ type: "traces", traces: traceList() });
}

function step(toMs: number): void {
  const before = pipe.openMinute;
  sim.runUntil(toMs);
  const events = pipe.advance(toMs);
  if (pipe.openMinute !== before) {
    const p = minutePoint();
    if (p) post({ type: "minute", point: p });
  }
  handle(events);
}

const summary = (t: StoredTrace): TraceSummary => ({ traceId: t.traceId, flow: t.flow, startMs: t.startNs / 1e6, durMs: t.durMs, error: t.error, reason: t.reason, partial: t.partial, spans: t.spans.length });

/** The newest kept traces, with the latest incident's exemplar pinned first while it is still stored. */
function traceList(): TraceSummary[] {
  const out: TraceSummary[] = [];
  for (let i = pipe.store.length - 1; i >= 0 && out.length < 60; i--) out.push(summary(pipe.store[i]));
  if (exemplarId && !out.some((t) => t.traceId === exemplarId)) {
    const t = pipe.store.find((x) => x.traceId === exemplarId);
    if (t) out.unshift(summary(t));
  }
  return out;
}

// ------------------------------------------------------------ the clock

function warmup(): void {
  const total = WARMUP_MIN * MINUTE_MS;
  const chunk = 20_000;
  const run = () => {
    const end = Math.min(total, sim.now + 6 * chunk);
    while (sim.now < end) {
      const t = Math.min(end, sim.now + chunk);
      step(t);
      absorbLive(chunk);
    }
    edgeCounts = {};
    post({ type: "warmup", done: sim.now, total });
    if (sim.now < total) setTimeout(run, 0);
    else {
      warm = true;
      lastSnapSim = sim.now;
      lastReal = performance.now();
      const f = sim.inject({ service: AUTOPLAY.service, kind: AUTOPLAY.kind, magnitude: AUTOPLAY.magnitude, startMs: sim.now + AUTOPLAY.afterMin * MINUTE_MS, durationMs: AUTOPLAY.durationMin * MINUTE_MS });
      scripted.add(f.id);
      snapshot();
      post({ type: "traces", traces: traceList() });
      setInterval(tick, 50);
    }
  };
  run();
}

function tick(): void {
  const now = performance.now();
  const dt = Math.min(now - lastReal, 250);
  lastReal = now;
  if (!warm || !visible) return;
  if (speed > 0) {
    const target = sim.now + dt * speed;
    // At most two simulated seconds per step, so minutes close on time.
    let t = sim.now;
    while (t < target) {
      t = Math.min(target, t + 2000);
      step(t);
    }
  }
  if (now - lastSnapReal >= 100) {
    lastSnapReal = now;
    absorbLive(sim.now - lastSnapSim);
    snapshot();
  }
  if (now - lastTracesReal >= 1000) {
    lastTracesReal = now;
    post({ type: "traces", traces: traceList() });
  }
}

// ------------------------------------------------------------ faults

function inject(f: FaultInput, isMystery = false): void {
  if (!touched) {
    touched = true;
    // The visitor is driving now: drop the scripted incident if it has not started.
    for (const id of scripted) {
      const s = sim.faults.find((x) => x.id === id);
      if (s && s.startMs > sim.now) sim.clear(id);
    }
  }
  const fault = sim.inject({ service: f.service, kind: f.kind, magnitude: f.magnitude, startMs: sim.now + (f.delayMs ?? 0), rampMs: f.kind === "deploy" ? 60_000 : undefined });
  if (isMystery) mystery.add(fault.id);
}

/** Faults that users notice, so the guessing game is fair. */
const MYSTERIES: FaultInput[] = [
  { service: "postgres", kind: "latency", magnitude: 30 },
  { service: "redis", kind: "timeout", magnitude: 0.25 },
  { service: "inventory", kind: "errors", magnitude: 0.12 },
  { service: "pricing", kind: "deploy", magnitude: 4 },
  { service: "cart", kind: "latency", magnitude: 60 },
  { service: "payments", kind: "capacity", magnitude: 0.67 },
  { service: "auth", kind: "errors", magnitude: 0.06 },
  { service: "payment-provider", kind: "timeout", magnitude: 0.2 },
  { service: "orders", kind: "deploy", magnitude: 3.5 },
  { service: "notifications", kind: "latency", magnitude: 900 },
  { service: "inventory", kind: "timeout", magnitude: 0.15 },
  { service: "gateway", kind: "capacity", magnitude: 0.5 },
];

// ------------------------------------------------------------ uploads

let uploaded = new Map<string, Span[]>();

function analyseUpload(text: string, name: string): UploadResult {
  const { spans, epochNs, warnings } = parseOtlp(text);
  if (!spans.length) throw new Error(warnings[0] ?? "no spans in this file");
  uploaded = groupByTrace(spans);
  const analysis = analyzeSpans(spans);
  // Errors first, then the slowest: the traces worth opening.
  analysis.traces.sort((a, b) => Number(b.error) - Number(a.error) || b.durMs - a.durMs);
  const firstId = analysis.traces[0]?.traceId;
  analysis.traces = analysis.traces.slice(0, 200);
  return {
    name,
    analysis,
    warnings: warnings.slice(0, 5),
    epochMs: Number(epochNs / 1_000_000n),
    first: firstId ? waterfall(uploaded.get(firstId)!) : null,
  };
}

function sampleExport(): { text: string; spans: number; traces: number } {
  // The latest kept traces: errors, slow ones and a few ordinary ones.
  const picked = pipe.store.filter((t) => !t.partial).slice(-60);
  const spans = picked.flatMap((t) => t.spans);
  const epochNs = BigInt(Math.round(Date.now() - sim.now)) * 1_000_000n;
  return { text: JSON.stringify(toOtlp(spans, epochNs)), spans: spans.length, traces: picked.length };
}

// ------------------------------------------------------------ messages

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  switch (m.type) {
    case "speed":
      speed = Math.max(0, Math.min(600, m.speed));
      break;
    case "visible":
      visible = m.visible;
      lastReal = performance.now();
      break;
    case "inject":
      inject(m.fault);
      break;
    case "mystery":
      inject(MYSTERIES[Math.floor(Math.random() * MYSTERIES.length)], true);
      break;
    case "clear":
      touched = true;
      sim.clear(m.id);
      break;
    case "trace": {
      let spans: Span[] | undefined;
      if (m.source === "live") spans = pipe.store.find((t) => t.traceId === m.traceId)?.spans;
      else spans = uploaded.get(m.traceId);
      post({ type: "waterfall", source: m.source, traceId: m.traceId, waterfall: spans?.length ? waterfall(spans) : null });
      break;
    }
    case "upload":
      try {
        post({ type: "upload", result: analyseUpload(m.text, m.name) });
      } catch (e) {
        post({ type: "upload", error: (e as Error).message });
      }
      break;
    case "sample": {
      const s = sampleExport();
      if (m.analyse) {
        try {
          post({ type: "upload", result: analyseUpload(s.text, `tracewise-sample-${s.traces}-traces.json`) });
        } catch (e) {
          post({ type: "upload", error: (e as Error).message });
        }
      } else post({ type: "sample", ...s });
      break;
    }
  }
};

post({ type: "ready", seed: SEED, startHour: START_HOUR, services: SERVICE_IDS });
warmup();
