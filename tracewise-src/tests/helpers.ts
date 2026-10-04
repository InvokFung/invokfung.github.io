import { Kind, Status, type Span, type SpanKind } from "../src/core/types";

/** A span with times given in ms, for hand-built traces. */
export function span(
  id: string,
  parent: string,
  service: string,
  start: number,
  end: number,
  opts: { kind?: SpanKind; error?: boolean; name?: string; attrs?: Span["attributes"]; trace?: string; message?: string } = {},
): Span {
  return {
    traceId: opts.trace ?? "t".padEnd(32, "0"),
    spanId: id,
    parentSpanId: parent,
    name: opts.name ?? `${service} op`,
    kind: opts.kind ?? Kind.SERVER,
    service,
    startNs: start * 1e6,
    endNs: end * 1e6,
    status: opts.error ? Status.ERROR : Status.UNSET,
    statusMessage: opts.message,
    attributes: opts.attrs ?? {},
  };
}
