import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { Simulator } from "../src/core/sim";
import { SERVICES } from "../src/core/topology";
import { Kind, type Span } from "../src/core/types";

function run(seed: number, minutes: number, setup?: (s: Simulator) => void): Span[] {
  const spans: Span[] = [];
  const sim = new Simulator({ seed, onSpan: (s) => spans.push(s) });
  setup?.(sim);
  sim.runUntil(minutes * 60_000);
  return spans;
}

function digest(spans: Span[]): string {
  const h = createHash("sha256");
  for (const s of spans) h.update(`${s.traceId}${s.spanId}${s.parentSpanId}${s.name}${s.service}${s.startNs}${s.endNs}${s.status}${JSON.stringify(s.attributes)}\n`);
  return h.digest("hex");
}

test("the same seed reproduces every span exactly; another seed does not", () => {
  const a = run(42, 5);
  const b = run(42, 5);
  assert.ok(a.length > 30_000);
  assert.equal(a.length, b.length);
  assert.equal(digest(a), digest(b));
  assert.notEqual(digest(run(43, 5)), digest(a));
});

test("a fault injected at a fixed time is deterministic too", () => {
  const setup = (s: Simulator) => s.inject({ service: "inventory", kind: "timeout", magnitude: 0.2, startMs: 60_000 });
  assert.equal(digest(run(9, 3, setup)), digest(run(9, 3, setup)));
});

test("spans are well formed: hex ids, ordered times, parents inside the trace", () => {
  const spans = run(7, 3);
  const ids = new Map<string, Set<string>>();
  for (const s of spans) (ids.get(s.traceId) ?? ids.set(s.traceId, new Set()).get(s.traceId)!).add(s.spanId);
  let roots = 0;
  for (const s of spans) {
    assert.match(s.traceId, /^[0-9a-f]{32}$/);
    assert.match(s.spanId, /^[0-9a-f]{16}$/);
    assert.ok(s.endNs >= s.startNs);
    if (!s.parentSpanId) roots++;
    // Spans still in flight at the cut-off may have parents that have not ended yet.
    else if (s.endNs < 2.9 * 60e9) assert.ok(ids.get(s.traceId)!.has(s.parentSpanId), `${s.name} lost its parent`);
  }
  assert.ok(roots > 1500);
  assert.ok(spans.some((s) => s.kind === Kind.CONSUMER) && spans.some((s) => s.kind === Kind.PRODUCER));
});

test("traffic follows the time of day", () => {
  const at = (h: number) => new Simulator({ seed: 1, startHour: h, onSpan: () => {} }).rate();
  assert.ok(at(14) > 2.5 * at(2));
});

test("a latency fault slows the target's spans; clearing it restores them", () => {
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const pg = (spans: Span[], from: number, to: number) =>
    median(spans.filter((s) => s.attributes["peer.service"] === "postgres" && s.startNs >= from * 1e6 && s.startNs < to * 1e6).map((s) => (s.endNs - s.startNs) / 1e6));
  const spans: Span[] = [];
  const sim = new Simulator({ seed: 3, onSpan: (s) => spans.push(s) });
  sim.runUntil(60_000);
  const f = sim.inject({ service: "postgres", kind: "latency", magnitude: 40 });
  sim.runUntil(120_000);
  sim.clear(f.id);
  sim.runUntil(180_000);
  const before = pg(spans, 0, 60_000);
  assert.ok(pg(spans, 60_000, 120_000) > before + 30);
  assert.ok(Math.abs(pg(spans, 125_000, 180_000) - before) < 1);
});

test("lost capacity removes workers and the queue builds; a bad deploy reports its new version", () => {
  const sim = new Simulator({ seed: 4, onSpan: () => {} });
  const payments = sim.stations.get("payments")!;
  const f = sim.inject({ service: "payments", kind: "capacity", magnitude: 0.7 });
  sim.runUntil(1);
  assert.equal(payments.workers, 1);
  sim.clear(f.id);
  assert.equal(payments.workers, SERVICES.find((s) => s.id === "payments")!.workers);

  const versions = new Set<string>();
  const sim2 = new Simulator({ seed: 4, onSpan: (s) => s.service === "pricing" && s.version && versions.add(s.version) });
  sim2.inject({ service: "pricing", kind: "deploy", magnitude: 2, rampMs: 10_000 });
  sim2.runUntil(60_000);
  assert.equal(versions.size, 2);
});
