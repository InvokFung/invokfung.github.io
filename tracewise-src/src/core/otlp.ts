// OTLP/JSON: the ExportTraceServiceRequest body that collectors and SDKs send
// to /v1/traces (resourceSpans -> scopeSpans -> spans). The parser accepts
// what real exporters write: hex or base64 ids, enum values as numbers or
// names, 64-bit integers as strings, and the older instrumentationLibrarySpans
// key. Times become nanoseconds since the earliest span; the epoch is returned
// alongside so nothing is lost.

import { Kind, Status, type AttrValue, type Span, type SpanKind, type StatusCode } from "./types";

interface AnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number | string;
  arrayValue?: { values?: AnyValue[] };
  kvlistValue?: { values?: KeyValue[] };
  bytesValue?: string;
}
interface KeyValue {
  key: string;
  value?: AnyValue;
}
interface OtlpSpan {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  kind?: number | string;
  startTimeUnixNano?: string | number;
  endTimeUnixNano?: string | number;
  attributes?: KeyValue[];
  status?: { code?: number | string; message?: string };
}
interface ScopeSpans {
  scope?: { name?: string; version?: string };
  spans?: OtlpSpan[];
}
interface ResourceSpans {
  resource?: { attributes?: KeyValue[] };
  scopeSpans?: ScopeSpans[];
  instrumentationLibrarySpans?: ScopeSpans[];
}
export interface ExportTraceServiceRequest {
  resourceSpans?: ResourceSpans[];
}

export interface ParseResult {
  spans: Span[];
  /** Unix nanoseconds of time 0. */
  epochNs: bigint;
  warnings: string[];
}

const KIND_BY_NAME: Record<string, SpanKind> = {
  SPAN_KIND_INTERNAL: Kind.INTERNAL,
  SPAN_KIND_SERVER: Kind.SERVER,
  SPAN_KIND_CLIENT: Kind.CLIENT,
  SPAN_KIND_PRODUCER: Kind.PRODUCER,
  SPAN_KIND_CONSUMER: Kind.CONSUMER,
};
const STATUS_BY_NAME: Record<string, StatusCode> = { STATUS_CODE_UNSET: Status.UNSET, STATUS_CODE_OK: Status.OK, STATUS_CODE_ERROR: Status.ERROR };

export function anyValue(v: AnyValue | undefined): AttrValue {
  if (!v) return "";
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.arrayValue) return (v.arrayValue.values ?? []).map((x) => String(anyValue(x))).join(", ");
  if (v.kvlistValue) return JSON.stringify(Object.fromEntries((v.kvlistValue.values ?? []).map((kv) => [kv.key, anyValue(kv.value)])));
  if (v.bytesValue !== undefined) return v.bytesValue;
  return "";
}

function attrs(kvs: KeyValue[] | undefined): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {};
  for (const kv of kvs ?? []) if (kv && typeof kv.key === "string") out[kv.key] = anyValue(kv.value);
  return out;
}

const HEX = /^[0-9a-f]*$/i;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** OTLP/JSON ids are hex; protobuf-JSON exporters sometimes write base64. */
export function normalizeId(id: string | undefined, bytes: number): string {
  if (!id) return "";
  if (id.length === bytes * 2 && HEX.test(id)) return id.toLowerCase();
  if (B64.test(id) && id.length === Math.ceil(bytes / 3) * 4) {
    const bin = atob(id);
    if (bin.length === bytes) {
      let hex = "";
      for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
      return /^0+$/.test(hex) ? "" : hex;
    }
  }
  return HEX.test(id) ? id.toLowerCase() : id;
}

function toBig(x: string | number | undefined): bigint | null {
  if (x === undefined || x === null || x === "") return null;
  try {
    return typeof x === "number" ? BigInt(Math.round(x)) : BigInt(x);
  } catch {
    return null;
  }
}

export function parseOtlp(input: string | ExportTraceServiceRequest): ParseResult {
  const req: ExportTraceServiceRequest = typeof input === "string" ? JSON.parse(input) : input;
  if (!req || !Array.isArray(req.resourceSpans)) throw new Error("not an OTLP ExportTraceServiceRequest: missing resourceSpans");
  const warnings: string[] = [];
  const raw: { span: Omit<Span, "startNs" | "endNs">; start: bigint; end: bigint }[] = [];
  let skipped = 0;
  for (const rs of req.resourceSpans) {
    const res = attrs(rs.resource?.attributes);
    const service = typeof res["service.name"] === "string" && res["service.name"] ? (res["service.name"] as string) : "unknown_service";
    const version = typeof res["service.version"] === "string" ? (res["service.version"] as string) : undefined;
    for (const ss of [...(rs.scopeSpans ?? []), ...(rs.instrumentationLibrarySpans ?? [])]) {
      for (const s of ss.spans ?? []) {
        const traceId = normalizeId(s.traceId, 16);
        const spanId = normalizeId(s.spanId, 8);
        const start = toBig(s.startTimeUnixNano);
        const end = toBig(s.endTimeUnixNano);
        if (!traceId || !spanId || start === null || end === null) {
          skipped++;
          continue;
        }
        const kind = typeof s.kind === "string" ? (KIND_BY_NAME[s.kind] ?? Kind.INTERNAL) : s.kind && s.kind >= 1 && s.kind <= 5 ? (s.kind as SpanKind) : Kind.INTERNAL;
        const code = s.status?.code;
        const status = typeof code === "string" ? (STATUS_BY_NAME[code] ?? Status.UNSET) : code === 2 ? Status.ERROR : code === 1 ? Status.OK : Status.UNSET;
        raw.push({
          span: {
            traceId,
            spanId,
            parentSpanId: normalizeId(s.parentSpanId, 8),
            name: s.name || "(unnamed)",
            kind,
            service,
            version,
            status,
            statusMessage: s.status?.message || undefined,
            attributes: attrs(s.attributes),
          },
          start,
          end: end < start ? start : end,
        });
      }
    }
  }
  if (skipped) warnings.push(`${skipped} span${skipped === 1 ? "" : "s"} without ids or times were skipped`);
  if (!raw.length) return { spans: [], epochNs: 0n, warnings: [...warnings, "no spans found"] };
  let epoch = raw[0].start;
  for (const r of raw) if (r.start < epoch) epoch = r.start;
  const spans = raw.map((r) => ({ ...r.span, startNs: Number(r.start - epoch), endNs: Number(r.end - epoch) }));
  return { spans, epochNs: epoch, warnings };
}

function anyOf(v: AttrValue): AnyValue {
  if (typeof v === "boolean") return { boolValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v };
  return { stringValue: v };
}

/** Spans back to an ExportTraceServiceRequest, grouped by service. */
export function toOtlp(spans: readonly Span[], epochNs: bigint, scope = { name: "tracewise-sim", version: "1.0.0" }): ExportTraceServiceRequest {
  const bySvc = new Map<string, Span[]>();
  for (const s of spans) {
    const k = `${s.service}\u0000${s.version ?? ""}`;
    (bySvc.get(k) ?? bySvc.set(k, []).get(k)!).push(s);
  }
  return {
    resourceSpans: [...bySvc.values()].map((group) => ({
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: group[0].service } },
          ...(group[0].version ? [{ key: "service.version", value: { stringValue: group[0].version } }] : []),
        ],
      },
      scopeSpans: [
        {
          scope,
          spans: group.map((s) => ({
            traceId: s.traceId,
            spanId: s.spanId,
            parentSpanId: s.parentSpanId,
            name: s.name,
            kind: s.kind,
            startTimeUnixNano: (epochNs + BigInt(Math.round(s.startNs))).toString(),
            endTimeUnixNano: (epochNs + BigInt(Math.round(s.endNs))).toString(),
            attributes: Object.entries(s.attributes).map(([key, v]) => ({ key, value: anyOf(v) })),
            status: s.status === Status.ERROR ? { code: 2, message: s.statusMessage ?? "" } : { code: s.status },
          })),
        },
      ],
    })),
  };
}
