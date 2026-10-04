import assert from "node:assert/strict";
import { test } from "node:test";
import { simPipelineOptions } from "../src/core/config";
import { Pipeline } from "../src/core/pipeline";
import { Simulator } from "../src/core/sim";
import { buildTree, criticalPath, criticalPathByNode, entries, exclusiveNs, unionLength } from "../src/core/tracetree";
import { Kind } from "../src/core/types";
import { span } from "./helpers";

test("union length merges overlaps and clips to the parent", () => {
  assert.equal(
    unionLength(
      [
        [10, 40],
        [30, 60],
        [90, 120],
      ],
      0,
      100,
    ),
    60,
  );
  assert.equal(unionLength([], 0, 10), 0);
});

test("exclusive time subtracts overlapping parallel children once", () => {
  const parent = span("p", "", "a", 0, 100);
  const kids = [span("c1", "p", "b", 10, 40), span("c2", "p", "c", 30, 60), span("c3", "p", "d", 90, 120)];
  assert.equal(exclusiveNs(parent, kids) / 1e6, 40);
  assert.equal(exclusiveNs(parent, []) / 1e6, 100);
});

test("spans assemble into the same tree in any arrival order; orphans become roots", () => {
  const spans = [
    span("r", "", "gateway", 0, 50),
    span("a", "r", "gateway", 5, 40, { kind: Kind.CLIENT }),
    span("b", "a", "orders", 6, 39),
    span("x", "missing", "notifications", 60, 70),
  ];
  for (const order of [spans, [...spans].reverse(), [spans[2], spans[0], spans[3], spans[1]]]) {
    const t = buildTree(order);
    assert.equal(t.root.span.spanId, "r");
    assert.equal(t.roots.length, 2);
    assert.deepEqual(
      t.root.children.map((c) => c.span.spanId),
      ["a"],
    );
    assert.equal(t.byId.get("b")!.depth, 2);
  }
});

test("a CLIENT span belongs to the service it waits on", () => {
  const t = buildTree([
    span("r", "", "cart", 0, 20),
    span("c", "r", "cart", 1, 15, { kind: Kind.CLIENT }),
    span("s", "c", "inventory", 2, 14),
    span("d", "s", "inventory", 3, 12, { kind: Kind.CLIENT, attrs: { "peer.service": "postgres", "db.system": "postgresql" } }),
    span("e", "r", "cart", 16, 18, { kind: Kind.CLIENT, attrs: { "db.system": "redis" } }),
  ]);
  assert.equal(t.byId.get("c")!.node, "inventory");
  assert.equal(t.byId.get("d")!.node, "postgres");
  assert.equal(t.byId.get("e")!.node, "redis");
  assert.equal(t.byId.get("r")!.node, "cart");
});

test("entries group a request's spans per node; errors are owned where they start", () => {
  const t = buildTree([
    span("r", "", "gateway", 0, 30, { error: true }),
    span("c", "r", "gateway", 1, 29, { kind: Kind.CLIENT, error: true }),
    span("s", "c", "orders", 2, 28, { error: true }),
    span("d", "s", "orders", 4, 27, { kind: Kind.CLIENT, error: true, attrs: { "peer.service": "postgres" } }),
  ]);
  const byNode = Object.fromEntries(entries(t).map((e) => [e.node, e]));
  // orders: the client gap (1 + 1 ms) plus its server span's self time (2 + 1 ms).
  assert.equal(byNode.orders.selfNs / 1e6, 5);
  assert.equal(byNode.postgres.selfNs / 1e6, 23);
  assert.equal(byNode.gateway.selfNs / 1e6, 2);
  assert.equal(byNode.postgres.ownError, true);
  assert.equal(byNode.orders.ownError, false);
  assert.equal(byNode.gateway.ownError, false);
  assert.equal(byNode.orders.parentNode, "gateway");
});

test("a cancellation is not the cancelled service's own error; the timeout is the slow callee's", () => {
  const t = buildTree([
    span("r", "", "gateway", 0, 300, { error: true }),
    span("c", "r", "gateway", 1, 251, { kind: Kind.CLIENT, error: true, message: "DEADLINE_EXCEEDED" }),
    span("s", "c", "orders", 2, 252, { error: true, message: "CANCELLED" }),
    span("p", "s", "orders", 3, 252, { kind: Kind.CLIENT, error: true, message: "CANCELLED", attrs: { "peer.service": "payment-provider" } }),
  ]);
  const byNode = Object.fromEntries(entries(t).map((e) => [e.node, e]));
  assert.equal(byNode["payment-provider"].ownError, false);
  assert.equal(byNode.orders.ownError, true, "orders timed out: the deadline error lands on orders");
  assert.equal(byNode.gateway.ownError, false);
});

test("the critical path follows the slower branch of a fan-out and adds up to the root", () => {
  const t = buildTree([
    span("r", "", "gw", 0, 100),
    span("a", "r", "inventory", 5, 60),
    span("b", "r", "pricing", 5, 90),
    span("b1", "b", "redis", 10, 80, { kind: Kind.CLIENT, attrs: { "peer.service": "redis" } }),
    span("c", "r", "notify", 92, 98),
  ]);
  const cp = criticalPath(t);
  const total = cp.reduce((s, x) => s + x.endNs - x.startNs, 0);
  assert.equal(total / 1e6, 100);
  const ids = new Set(cp.map((s) => s.span.span.spanId));
  assert.ok(ids.has("b") && ids.has("b1") && ids.has("c"));
  assert.ok(!ids.has("a"), "the faster parallel branch is not critical");
  const byNode = criticalPathByNode(t);
  assert.equal(byNode.get("redis")! / 1e6, 70);
  assert.equal(byNode.get("pricing")! / 1e6, 15);
});

test("asynchronous work after the request ends is not on its critical path", () => {
  const t = buildTree([span("r", "", "orders", 0, 20), span("p", "r", "orders", 15, 16, { kind: Kind.PRODUCER }), span("q", "p", "notify", 30, 50, { kind: Kind.CONSUMER })]);
  const cp = criticalPath(t);
  assert.ok(!cp.some((s) => s.span.span.spanId === "q"));
  assert.equal(cp.reduce((s, x) => s + x.endNs - x.startNs, 0) / 1e6, 20);
});

test("on simulated traces, segments always sum to the root duration and self times are non-negative", () => {
  let checked = 0;
  const pipe = new Pipeline(
    simPipelineOptions({
      onTrace: (a) => {
        if (a.fragment || a.tree.root.span.parentSpanId) return;
        const cp = criticalPath(a.tree);
        const sum = cp.reduce((s, x) => s + x.endNs - x.startNs, 0);
        const root = a.tree.root.span;
        assert.ok(Math.abs(sum - (root.endNs - root.startNs)) < 1, `trace ${root.traceId}`);
        for (const n of a.tree.nodes) assert.ok(n.selfNs >= 0);
        checked++;
      },
    }),
  );
  const sim = new Simulator({ seed: 11, onSpan: (s) => pipe.ingest(s) });
  sim.runUntil(60_000);
  sim.inject({ service: "payments", kind: "timeout", magnitude: 0.3 });
  for (let t = 1000; t <= 180_000; t += 1000) {
    sim.runUntil(t);
    pipe.advance(t);
  }
  assert.ok(checked > 1000, `${checked} traces`);
});
