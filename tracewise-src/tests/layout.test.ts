import assert from "node:assert/strict";
import { test } from "node:test";
import { assignLayers, layout, pointAt, samplePath } from "../src/core/layout";
import { SERVICE_IDS, staticEdges } from "../src/core/topology";

test("layers follow the longest call chain, and a cycle does not loop forever", () => {
  const l = assignLayers(["a", "b", "c", "d"], [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "a", to: "c" },
    { from: "c", to: "a" },
    { from: "a", to: "d" },
  ]);
  assert.deepEqual(Object.fromEntries(l), { a: 0, b: 1, c: 2, d: 1 });
});

test("the ordering sweeps remove avoidable crossings", () => {
  // Drawn in input order, a->y and b->x cross; swapping one layer removes it.
  const r = layout({ nodes: ["a", "b", "x", "y"], edges: [{ from: "a", to: "y" }, { from: "b", to: "x" }] }, { width: 400, height: 300, vertical: false, pad: 20 });
  assert.equal(r.crossings, 0);
  const n = r.nodes;
  assert.equal(Math.sign(n.get("a")!.y - n.get("b")!.y), Math.sign(n.get("y")!.y - n.get("x")!.y));
});

test("the service map: gateway first, storage last, nodes apart, every point inside the box", () => {
  for (const vertical of [false, true]) {
    const w = vertical ? 360 : 960;
    const h = vertical ? 640 : 420;
    const r = layout({ nodes: SERVICE_IDS, edges: staticEdges() }, { width: w, height: h, vertical, pad: 40 });
    const g = r.nodes.get("gateway")!;
    assert.equal(g.layer, 0);
    assert.equal(r.nodes.get("postgres")!.layer, r.layers - 1);
    const pts = [...r.nodes.values()];
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) > 60, `${pts[i].id} and ${pts[j].id} overlap`);
    for (const p of pts) assert.ok(p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h);
    assert.equal(r.edges.length, staticEdges().length);
  }
});

test("a sampled path is walked at constant speed from end to end", () => {
  const p = samplePath([{ x: 0, y: 0 }, { x: 100, y: 0 }], false);
  assert.ok(Math.abs(p.total - 100) < 1e-3);
  const q = { x: 0, y: 0 };
  assert.ok(Math.abs(pointAt(p, 25, q).x - 25) < 0.5);
  assert.deepEqual(pointAt(p, 1e9, q), { x: 100, y: 0 });
});
