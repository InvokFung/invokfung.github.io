import { test } from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../src/core/rng";

test("rng: the same seed gives the same stream, another seed a different one", () => {
  const a = new Rng("dispatch");
  const b = new Rng("dispatch");
  const c = new Rng("dispatch-2");
  const xs = Array.from({ length: 1000 }, () => a.u32());
  const ys = Array.from({ length: 1000 }, () => b.u32());
  const zs = Array.from({ length: 1000 }, () => c.u32());
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, zs);
});

test("rng: ranges stay in bounds and look uniform; normal() is centred", () => {
  const r = new Rng("bounds");
  const counts = new Array(6).fill(0);
  for (let i = 0; i < 60_000; i++) {
    const x = r.range(1, 6);
    assert.ok(x >= 1 && x <= 6 && Number.isInteger(x));
    counts[x - 1]++;
  }
  for (const c of counts) assert.ok(Math.abs(c - 10_000) < 500, `bucket ${c}`);
  let sum = 0;
  let sq = 0;
  for (let i = 0; i < 50_000; i++) {
    const z = r.normal();
    sum += z;
    sq += z * z;
  }
  assert.ok(Math.abs(sum / 50_000) < 0.03);
  assert.ok(Math.abs(sq / 50_000 - 1) < 0.05);
});
