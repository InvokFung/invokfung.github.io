import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeSpans, waterfall } from "../src/core/analyze";
import { normalizeId, parseOtlp, toOtlp } from "../src/core/otlp";
import { Simulator } from "../src/core/sim";
import { Kind, Status, type Span } from "../src/core/types";

const SAMPLE = {
  resourceSpans: [
    {
      resource: { attributes: [{ key: "service.name", value: { stringValue: "frontend" } }, { key: "service.version", value: { stringValue: "1.2.3" } }] },
      scopeSpans: [
        {
          scope: { name: "io.opentelemetry.http" },
          spans: [
            {
              traceId: "5B8EFFF798038103D269B633813FC60C",
              spanId: "EEE19B7EC3C1B174",
              parentSpanId: "",
              name: "GET /cart",
              kind: "SPAN_KIND_SERVER",
              startTimeUnixNano: "1544712660000000000",
              endTimeUnixNano: "1544712661000000000",
              attributes: [
                { key: "http.response.status_code", value: { intValue: "500" } },
                { key: "retry", value: { boolValue: true } },
                { key: "ratio", value: { doubleValue: 0.25 } },
                { key: "tags", value: { arrayValue: { values: [{ stringValue: "a" }, { stringValue: "b" }] } } },
              ],
              status: { code: "STATUS_CODE_ERROR", message: "boom" },
            },
            {
              traceId: "5B8EFFF798038103D269B633813FC60C",
              spanId: "AAA19B7EC3C1B174",
              parentSpanId: "EEE19B7EC3C1B174",
              name: "SELECT carts",
              kind: 3,
              startTimeUnixNano: "1544712660100000000",
              endTimeUnixNano: "1544712660900000000",
              attributes: [{ key: "db.system", value: { stringValue: "postgresql" } }],
              status: { code: 2 },
            },
          ],
        },
      ],
    },
    {
      resource: { attributes: [{ key: "service.name", value: { stringValue: "cart" } }] },
      // The pre-1.0 field name, still emitted by some exporters.
      instrumentationLibrarySpans: [
        {
          spans: [
            {
              // base64 ids, as protobuf-JSON writes them
              traceId: "W47/95gDgQPSabYzgT/GDA==",
              spanId: "qqqqqqqqqqo=",
              parentSpanId: "7uGbfsPBsXQ=",
              name: "internal",
              startTimeUnixNano: 1544712660200000000,
              endTimeUnixNano: "1544712660300000000",
            },
          ],
        },
      ],
    },
  ],
};

test("parses OTLP/JSON: hex and base64 ids, enum names and numbers, typed attributes, the legacy key", () => {
  const { spans, epochNs, warnings } = parseOtlp(JSON.stringify(SAMPLE));
  assert.deepEqual(warnings, []);
  assert.equal(spans.length, 3);
  assert.equal(epochNs, 1544712660000000000n);
  const root = spans[0];
  assert.equal(root.traceId, "5b8efff798038103d269b633813fc60c");
  assert.equal(root.kind, Kind.SERVER);
  assert.equal(root.service, "frontend");
  assert.equal(root.version, "1.2.3");
  assert.equal(root.status, Status.ERROR);
  assert.equal(root.statusMessage, "boom");
  assert.equal(root.endNs - root.startNs, 1e9);
  assert.deepEqual(root.attributes, { "http.response.status_code": 500, retry: true, ratio: 0.25, tags: "a, b" });
  assert.equal(spans[1].kind, Kind.CLIENT);
  assert.equal(spans[1].status, Status.ERROR);
  const legacy = spans[2];
  assert.equal(legacy.traceId, root.traceId);
  assert.equal(legacy.parentSpanId, root.spanId);
  assert.equal(legacy.spanId, "aaaaaaaaaaaaaaaa");
  assert.equal(legacy.kind, Kind.INTERNAL);
  assert.equal(legacy.startNs, 200_000_000);
});

test("rejects input that is not a trace export and skips spans without ids", () => {
  assert.throws(() => parseOtlp("{}"), /resourceSpans/);
  assert.throws(() => parseOtlp("not json"));
  const r = parseOtlp({ resourceSpans: [{ scopeSpans: [{ spans: [{ name: "x" }] }] }] });
  assert.equal(r.spans.length, 0);
  assert.equal(r.warnings.length, 2);
  assert.equal(normalizeId("AAAAAAAAAAA=", 8), "");
});

test("the analysis of an uploaded file attributes the database call to the database", () => {
  const { spans } = parseOtlp(SAMPLE as never);
  const a = analyzeSpans(spans);
  assert.equal(a.traces.length, 1);
  const db = a.services.find((s) => s.node === "postgresql")!;
  assert.equal(db.inferred, true);
  assert.equal(a.services.find((s) => s.node === "cart")!.inferred, false, "a service with spans of its own is not inferred");
  assert.equal(db.ownErr, 1);
  assert.equal(a.services.find((s) => s.node === "frontend")!.ownErr, 0);
  assert.deepEqual(
    a.edges.map((e) => `${e.from}>${e.to}`).sort(),
    ["frontend>cart", "frontend>postgresql"],
  );
  const w = waterfall(spans);
  assert.equal(w.spans[0].name, "GET /cart");
  assert.ok(Math.abs(w.spans.reduce((s, x) => s + x.criticalMs, 0) - 1000) < 1e-6);
});

test("simulated spans survive a round trip through OTLP/JSON", () => {
  const spans: Span[] = [];
  const sim = new Simulator({ seed: 5, onSpan: (s) => spans.push(s) });
  sim.runUntil(20_000);
  const epoch = 1_790_000_000_000_000_000n;
  const back = parseOtlp(JSON.stringify(toOtlp(spans, epoch)));
  assert.equal(back.spans.length, spans.length);
  const byId = new Map(back.spans.map((s) => [s.spanId, s]));
  const shift = Number(back.epochNs - epoch);
  for (const s of spans) {
    const b = byId.get(s.spanId)!;
    assert.equal(b.traceId, s.traceId);
    assert.equal(b.parentSpanId, s.parentSpanId);
    assert.equal(b.kind, s.kind);
    assert.equal(b.status, s.status);
    assert.equal(b.startNs + shift, s.startNs);
    assert.equal(b.endNs - b.startNs, s.endNs - s.startNs);
    assert.deepEqual(b.attributes, s.attributes);
  }
  // Called through client spans, but with spans of their own: not inferred.
  const a = analyzeSpans(back.spans);
  const inferred = a.services.filter((x) => x.inferred).map((x) => x.node).sort();
  assert.deepEqual(inferred, ["payment-provider", "postgres", "redis"]);
});
