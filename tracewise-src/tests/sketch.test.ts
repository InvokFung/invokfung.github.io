import assert from "node:assert/strict";
import { test } from "node:test";
import { Rng } from "../src/core/rng";
import { RollingSketch } from "../src/core/sampler";
import { DDSketch, exactQuantile } from "../src/core/sketch";

const QS = [0, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 0.999, 1];

function check(xs: number[], alpha = 0.01) {
  const s = new DDSketch(alpha);
  for (const x of xs) s.add(x);
  const sorted = Float64Array.from(xs).sort();
  for (const q of QS) {
    const exact = exactQuantile(sorted, q);
    const est = s.quantile(q);
    const rel = Math.abs(est - exact) / exact;
    assert.ok(rel <= alpha + 1e-12, `q=${q}: estimate ${est} vs exact ${exact}, relative error ${rel}`);
  }
  return s;
}

test("relative error stays within alpha on lognormal, Pareto and uniform data", () => {
  const rng = new Rng(1);
  check(Array.from({ length: 20_000 }, () => rng.lognormal(12, 1.2)));
  check(Array.from({ length: 20_000 }, () => 1 / Math.pow(1 - rng.float(), 1 / 1.3)));
  check(Array.from({ length: 5_000 }, () => rng.range(0.001, 1000)));
  check(Array.from({ length: 3_000 }, () => rng.lognormal(5, 0.3)), 0.05);
});

test("memory is logarithmic in the value range, not linear in the count", () => {
  const rng = new Rng(2);
  const s = new DDSketch(0.01);
  for (let i = 0; i < 200_000; i++) s.add(rng.lognormal(20, 1.5));
  assert.equal(s.count, 200_000);
  assert.ok(s.buckets < 1000, `${s.buckets} buckets`);
});

test("merging sketches equals sketching the union", () => {
  const rng = new Rng(3);
  const a = new DDSketch();
  const b = new DDSketch();
  const all = new DDSketch();
  for (let i = 0; i < 5000; i++) {
    const x = rng.lognormal(3, 1);
    (i % 3 ? a : b).add(x);
    all.add(x);
  }
  a.merge(b);
  for (const q of QS) assert.equal(a.quantile(q), all.quantile(q));
  assert.equal(a.count, all.count);
});

test("subtract undoes merge exactly (counts are integers)", () => {
  const rng = new Rng(4);
  const keep = new DDSketch();
  const gone = new DDSketch();
  for (let i = 0; i < 4000; i++) keep.add(rng.lognormal(10, 0.8));
  for (let i = 0; i < 4000; i++) gone.add(rng.lognormal(200, 0.8));
  const total = keep.clone();
  total.merge(gone);
  total.subtract(gone);
  for (const q of [0.01, 0.5, 0.9, 0.99]) assert.equal(total.quantile(q), keep.quantile(q));
});

test("zeros go to the zero bucket", () => {
  const s = new DDSketch();
  for (let i = 0; i < 90; i++) s.add(0);
  for (let i = 1; i <= 10; i++) s.add(i);
  assert.equal(s.quantile(0.5), 0);
  assert.ok(Math.abs(s.quantile(1) - 10) / 10 <= 0.01);
});

test("collapsing low buckets keeps the guarantee for upper quantiles", () => {
  const s = new DDSketch(0.01, 64);
  const xs: number[] = [];
  for (let i = 0; i < 5000; i++) xs.push(Math.pow(10, -6 + (12 * i) / 5000));
  for (const x of xs) s.add(x);
  assert.ok(s.buckets <= 64);
  const sorted = Float64Array.from(xs).sort();
  for (const q of [0.99, 0.999, 1]) {
    const e = exactQuantile(sorted, q);
    assert.ok(Math.abs(s.quantile(q) - e) / e <= 0.01);
  }
});

test("a rolling sketch forgets minutes that leave the window", () => {
  const w = new RollingSketch(3);
  for (let m = 0; m < 3; m++) {
    for (let i = 0; i < 100; i++) w.add(10);
    w.roll();
  }
  assert.ok(Math.abs(w.total.quantile(0.5) - 10) / 10 <= 0.01);
  for (let m = 0; m < 3; m++) {
    for (let i = 0; i < 100; i++) w.add(1000);
    w.roll();
  }
  assert.equal(w.total.count, 300);
  assert.ok(Math.abs(w.total.quantile(0.01) - 1000) / 1000 <= 0.01);
});
