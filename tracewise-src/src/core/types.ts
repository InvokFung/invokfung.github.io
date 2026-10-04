// OpenTelemetry-shaped span, as the simulator emits it and the OTLP parser
// produces it. Times are nanoseconds since the trace epoch (the start of the
// simulation, or the earliest span of an uploaded file); `epochNs` on the
// exporter turns them back into Unix nanoseconds.

/** OTel SpanKind enum values. */
export const Kind = { INTERNAL: 1, SERVER: 2, CLIENT: 3, PRODUCER: 4, CONSUMER: 5 } as const;
export type SpanKind = (typeof Kind)[keyof typeof Kind];
export const KIND_NAME: Record<number, string> = { 0: "UNSPECIFIED", 1: "INTERNAL", 2: "SERVER", 3: "CLIENT", 4: "PRODUCER", 5: "CONSUMER" };

/** OTel status codes. */
export const Status = { UNSET: 0, OK: 1, ERROR: 2 } as const;
export type StatusCode = (typeof Status)[keyof typeof Status];

export type AttrValue = string | number | boolean;

export interface Span {
  traceId: string;
  spanId: string;
  /** Empty for a root span. */
  parentSpanId: string;
  name: string;
  kind: SpanKind;
  /** Resource attribute service.name. */
  service: string;
  /** Resource attribute service.version. */
  version?: string;
  startNs: number;
  endNs: number;
  status: StatusCode;
  statusMessage?: string;
  attributes: Record<string, AttrValue>;
}

export const NS_PER_MS = 1e6;
export const durMs = (s: Span) => (s.endNs - s.startNs) / NS_PER_MS;
