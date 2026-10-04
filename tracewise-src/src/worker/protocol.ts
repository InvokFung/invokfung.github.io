// Messages between the page and the engine worker. Everything here is
// structured-cloneable plain data.

import type { BatchAnalysis, Waterfall } from "../core/analyze";
import type { Alert, AlertKind } from "../core/pipeline";
import type { RcaResult } from "../core/rca";
import type { FaultKind } from "../core/sim";

export interface FaultInput {
  service: string;
  kind: FaultKind;
  magnitude: number;
  /** Simulated ms from now until it starts. */
  delayMs?: number;
}

export type ToWorker =
  | { type: "speed"; speed: number }
  | { type: "inject"; fault: FaultInput }
  | { type: "mystery" }
  | { type: "clear"; id?: number }
  | { type: "trace"; traceId: string; source: "live" | "upload" }
  | { type: "upload"; text: string; name: string }
  | { type: "sample"; analyse: boolean }
  | { type: "visible"; visible: boolean };

export type Health = 0 | 1 | 2;

export interface NodeSnap {
  busy: number;
  workers: number;
  queue: number;
  /** Requests handled per simulated second, smoothed. */
  rps: number;
  /** Share of requests that failed (including failures passed up from dependencies), smoothed. */
  err: number;
  /** Mean self time, ms, smoothed, and its slow-moving baseline. */
  selfMs: number;
  baseMs: number;
  health: Health;
  version: string;
  /** Detector z-scores at the last closed minute. */
  latZ: number;
  errZ: number;
}

export interface FaultView {
  id: number;
  service: string;
  kind: FaultKind;
  magnitude: number;
  startMs: number;
  endMs: number | null;
  version?: string;
  /** Picked at random and hidden until revealed. */
  mystery: boolean;
  /** The incident that plays on its own when the page opens. */
  scripted: boolean;
}

export interface Snapshot {
  simMs: number;
  /** Simulated hour of day, fractional. */
  hour: number;
  speed: number;
  /** Arrival rate now, requests per simulated second. */
  rate: number;
  nodes: Record<string, NodeSnap>;
  /** Calls completed on each edge since the previous snapshot. */
  edges: Record<string, { n: number; err: number }>;
  /** Simulated ms covered by the edge counts. */
  dtMs: number;
  totals: {
    spans: number;
    traces: number;
    seen: number;
    kept: number;
    errorTraces: number;
    errorKept: number;
    lateSpans: number;
    stored: number;
  };
  faults: FaultView[];
  alerts: Alert[];
  /** Nodes ranked by the open incident, best first. */
  suspects: string[];
}

export interface FlowPoint {
  n: number;
  p50: number;
  p95: number;
  p99: number;
  /** Error ratio. */
  err: number;
  /** Burn rates: fast rule [1h, 5m], slow rule [6h, 30m]. */
  burn: [number, number][];
  latZ: number;
  errZ: number;
}

export interface MinutePoint {
  minute: number;
  /** Simulated ms when the minute closed. */
  closedMs: number;
  flows: Record<string, FlowPoint>;
}

export interface IncidentView {
  id: number;
  flow: string;
  openedAt: number;
  openedMinute: number;
  onsetMinute: number;
  closedAt?: number;
  alerts: { id: number; kind: AlertKind; flow: string; firedAt: number; resolvedAt?: number; detail: string }[];
  rca: RcaResult | null;
  ranks: { minute: number; top: string[] }[];
  /** A kept trace that shows the top suspect at work, when one exists. */
  exemplar?: string;
}

export interface TraceSummary {
  traceId: string;
  flow: string;
  /** Simulated ms at the trace's start. */
  startMs: number;
  durMs: number;
  error: boolean;
  reason: "error" | "slow" | "sampled";
  partial: boolean;
  spans: number;
}

export interface UploadResult {
  name: string;
  analysis: BatchAnalysis;
  warnings: string[];
  /** Unix ms of the earliest span. */
  epochMs: number;
  first: Waterfall | null;
}

export type FromWorker =
  | { type: "ready"; seed: number; startHour: number; services: string[] }
  | { type: "warmup"; done: number; total: number }
  | { type: "snapshot"; snap: Snapshot }
  | { type: "minute"; point: MinutePoint }
  | { type: "incident"; incident: IncidentView }
  | { type: "traces"; traces: TraceSummary[] }
  | { type: "waterfall"; source: "live" | "upload"; traceId: string; waterfall: Waterfall | null }
  | { type: "upload"; result?: UploadResult; error?: string }
  | { type: "sample"; text: string; spans: number; traces: number };
