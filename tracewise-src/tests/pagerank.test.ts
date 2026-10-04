import assert from "node:assert/strict";
import { test } from "node:test";
import { pageRank } from "../src/core/pagerank";
import { blameWalk } from "../src/core/rca";

const sum = (xs: ArrayLike<number>) => Array.from(xs).reduce((a, b) => a + b, 0);

test("ranks sum to one and a directed cycle is uniform", () => {
  const { rank } = pageRank(4, [
    { from: 0, to: 1, w: 1 },
    { from: 1, to: 2, w: 1 },
    { from: 2, to: 3, w: 1 },
    { from: 3, to: 0, w: 1 },
  ]);
  assert.ok(Math.abs(sum(rank) - 1) < 1e-9);
  for (const r of rank) assert.ok(Math.abs(r - 0.25) < 1e-9);
});

test("matches the closed form on two nodes", () => {
  // 0 -> 1 only; 1 dangles and restarts uniformly. Solve r = d M r + (1 - d + d r1) / 2.
  const d = 0.85;
  const { rank } = pageRank(2, [{ from: 0, to: 1, w: 1 }], undefined, { damping: d });
  const r0 = (1 - d + d * rank[1]) / 2;
  assert.ok(Math.abs(rank[0] - r0) < 1e-9);
  assert.ok(Math.abs(rank[1] - (d * rank[0] + r0)) < 1e-9);
});

test("personalization biases restarts and edge weights split the flow", () => {
  const edges = [
    { from: 0, to: 1, w: 3 },
    { from: 0, to: 2, w: 1 },
  ];
  const { rank } = pageRank(3, edges, [1, 0, 0]);
  assert.ok(rank[1] > 2.5 * rank[2] && rank[1] < 3.5 * rank[2]);
  const { rank: other } = pageRank(3, edges, [0, 0, 1]);
  assert.ok(other[2] > other[1]);
});

test("blame flows past a healthy service to the deepest anomalous dependency", () => {
  // gateway(0) -> orders(1) -> payments(2) -> provider(3). The gateway queues
  // (a symptom), orders and payments are healthy themselves, the provider is slow.
  const node = [0.9, 0, 0, 0.95];
  const calls = [
    { from: 0, to: 1, anomaly: 0.9 },
    { from: 1, to: 2, anomaly: 0.9 },
    { from: 2, to: 3, anomaly: 0.95 },
  ];
  const r = blameWalk(4, calls, node);
  assert.equal(r.indexOf(Math.max(...r)), 3);
  // Weighting edges by the callee's own anomaly instead strands much of the blame at the gateway.
  const selfOnly = blameWalk(
    4,
    calls.map((c) => ({ ...c, anomaly: node[c.to] })),
    node,
  );
  assert.ok(selfOnly[0] > 3 * r[0], `gateway keeps ${selfOnly[0].toFixed(3)} vs ${r[0].toFixed(3)}`);
  assert.ok(r[3] > selfOnly[3]);
});

test("a service that is worse than everything it calls keeps the blame", () => {
  const node = [0.3, 1, 0, 0];
  const calls = [
    { from: 0, to: 1, anomaly: 0.8 },
    { from: 1, to: 2, anomaly: 0 },
    { from: 1, to: 3, anomaly: 0 },
  ];
  const r = blameWalk(4, calls, node);
  assert.equal(r.indexOf(Math.max(...r)), 1);
});
