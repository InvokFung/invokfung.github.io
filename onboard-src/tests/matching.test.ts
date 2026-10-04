import { test } from "node:test";
import assert from "node:assert/strict";
import { em, initialM, levelWeights, probability, toPatterns } from "../src/core/fs";
import { clusterize, type ErPairs } from "../src/core/er";
import { UnionFind } from "../src/core/unionfind";
import { hungarian } from "../src/core/mapping";
import { bcubed, pairwise } from "../src/core/evaluate";
import { Rng } from "../src/core/rng";

test("EM recovers m, u and the match share from an unlabelled two-class mixture", () => {
  // three comparators, level 0 = agree, level 1 = disagree
  const lambda = 0.2;
  const mAgree = [0.95, 0.9, 0.8];
  const uAgree = [0.05, 0.15, 0.3];
  const rng = new Rng("em-mixture");
  const N = 40_000;
  const K = 3;
  const g = new Int8Array(N * K);
  for (let p = 0; p < N; p++) {
    const match = rng.chance(lambda);
    for (let k = 0; k < K; k++) g[p * K + k] = rng.chance(match ? mAgree[k] : uAgree[k]) ? 0 : 1;
  }
  const pat = toPatterns(g, K);
  assert.equal(pat.counts.length, 8); // 2^3 distinct vectors
  assert.equal(pat.counts.reduce((a, b) => a + b, 0), N);
  const r = em(pat, { lambda: 0.5, m: initialM([2, 2, 2]), u: [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5]] }, { maxIter: 500, tol: 1e-10 });
  assert.equal(r.converged, true);
  // the log-likelihood never goes down
  for (let i = 1; i < r.logLik.length; i++) assert.ok(r.logLik[i] >= r.logLik[i - 1] - 1e-6, `iteration ${i}`);
  assert.ok(Math.abs(r.params.lambda - lambda) < 0.02, `lambda ${r.params.lambda}`);
  for (let k = 0; k < K; k++) {
    assert.ok(Math.abs(r.params.m[k][0] - mAgree[k]) < 0.03, `m[${k}] ${r.params.m[k][0]}`);
    assert.ok(Math.abs(r.params.u[k][0] - uAgree[k]) < 0.03, `u[${k}] ${r.params.u[k][0]}`);
  }
  // agreement is evidence for a match, disagreement against
  const w = levelWeights(r.params);
  for (let k = 0; k < K; k++) assert.ok(w[k][0] > 0 && w[k][1] < 0);
  assert.equal(probability(0), 0.5);
  assert.ok(Math.abs(probability(10) - 1024 / 1025) < 1e-12);
});

test("EM with u fixed only re-estimates m and λ", () => {
  const g = Int8Array.from([0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1]);
  const u = [[0.1, 0.9], [0.2, 0.8]];
  const r = em(toPatterns(g, 2), { lambda: 0.3, m: initialM([2, 2]), u }, { fixU: true });
  assert.deepEqual(r.params.u, u);
});

test("union-find: unions, sets, labels", () => {
  const uf = new UnionFind(6);
  uf.union(0, 1);
  uf.union(2, 3);
  uf.union(1, 3);
  assert.equal(uf.same(0, 2), true);
  assert.equal(uf.same(0, 4), false);
  assert.equal(uf.sets, 3);
  const l = uf.labels();
  assert.equal(l[0], l[3]);
  assert.notEqual(l[4], l[5]);
  // random unions agree with a naive relabelling
  const rng = new Rng("uf");
  const n = 300;
  const u2 = new UnionFind(n);
  const naive = Array.from({ length: n }, (_, i) => i);
  for (let t = 0; t < 400; t++) {
    const a = rng.int(n);
    const b = rng.int(n);
    u2.union(a, b);
    const from = naive[b];
    const to = naive[a];
    for (let i = 0; i < n; i++) if (naive[i] === from) naive[i] = to;
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j += 7) assert.equal(u2.same(i, j), naive[i] === naive[j]);
  assert.equal(u2.sets, new Set(naive).size);
});

function pairs(list: [number, number, number, number?][]): ErPairs {
  const P = list.length;
  return {
    a: Int32Array.from(list.map((x) => x[0])),
    b: Int32Array.from(list.map((x) => x[1])),
    gammas: new Int8Array(P),
    contrib: new Float32Array(P),
    weight: new Float32Array(P),
    prob: Float32Array.from(list.map((x) => x[2])),
    veto: Uint8Array.from(list.map((x) => x[3] ?? 0)),
  };
}

const th = { match: 0.95, review: 0.6 };

test("clustering: a guard rule stops a transitive chain from joining two people", () => {
  // 0–1 and 1–2 look like matches; 0 and 2 have different first names (veto)
  const p = pairs([
    [0, 1, 0.99],
    [1, 2, 0.98],
    [0, 2, 0.7, 1],
    [3, 4, 0.8],
  ]);
  const c = clusterize(5, p, th);
  assert.equal(c.labels[0], c.labels[1]);
  assert.notEqual(c.labels[1], c.labels[2]);
  assert.equal(c.blocked, 1);
  assert.equal(c.autoMatched, 1);
  assert.deepEqual(c.review, [3, 2]); // best first; the vetoed pair waits for a person
  // without guards the chain closes
  const loose = clusterize(5, p, th, new Map(), undefined, { guards: false });
  assert.equal(loose.labels[0], loose.labels[2]);
});

test("clustering: review decisions merge, split, and override a guard but not another rejection", () => {
  const p = pairs([
    [0, 1, 0.99],
    [1, 2, 0.98],
    [0, 2, 0.7, 1],
    [3, 4, 0.8],
  ]);
  // accepting the vetoed pair overrides the guard
  const a = clusterize(5, p, th, new Map([[2, true]]));
  assert.equal(a.labels[0], a.labels[2]);
  assert.equal(a.labels[1], a.labels[2]);
  assert.equal(a.accepted, 1);
  // accepting a review pair merges it and removes it from the queue
  const b = clusterize(5, p, th, new Map([[3, true]]));
  assert.equal(b.labels[3], b.labels[4]);
  assert.ok(!b.review.includes(3));
  // rejecting an automatic match splits it
  const c = clusterize(5, p, th, new Map([[0, false]]));
  assert.notEqual(c.labels[0], c.labels[1]);
  assert.equal(c.labels[1], c.labels[2]);
  // a reviewer's "different" beats another reviewer's "same" further along the chain
  const d = clusterize(5, p, th, new Map([[0, false], [1, true], [2, true]]));
  assert.notEqual(d.labels[0], d.labels[1]);
  // excluded (quarantined) records never merge
  const e = clusterize(5, p, th, new Map(), Uint8Array.from([0, 0, 0, 1, 0]));
  assert.ok(!e.review.includes(3));
});

test("clustering: raising the match threshold only ever splits clusters", () => {
  const rng = new Rng("thresholds");
  const n = 200;
  const list: [number, number, number][] = [];
  for (let t = 0; t < 600; t++) list.push([rng.int(n), rng.int(n), rng.next()]);
  const p = pairs(list);
  let prev = clusterize(n, p, { match: 0.5, review: 0.3 }).clusters;
  for (const m of [0.6, 0.7, 0.8, 0.9, 0.99]) {
    const c = clusterize(n, p, { match: m, review: 0.3 }).clusters;
    assert.ok(c >= prev);
    prev = c;
  }
});

test("hungarian: equals brute force on 300 random cost matrices", () => {
  const rng = new Rng("hungarian");
  const perms = (n: number, m: number): number[][] => {
    const out: number[][] = [];
    const rec = (row: number[], used: Set<number>) => {
      if (row.length === n) return void out.push([...row]);
      for (let j = 0; j < m; j++) if (!used.has(j)) rec([...row, j], new Set([...used, j]));
    };
    rec([], new Set());
    return out;
  };
  for (let t = 0; t < 300; t++) {
    const n = rng.range(1, 5);
    const m = rng.range(n, 6);
    const cost = Array.from({ length: n }, () => Array.from({ length: m }, () => Math.round(rng.next() * 100) / 100));
    const ans = hungarian(cost);
    assert.equal(new Set(ans).size, n);
    const total = ans.reduce((a, j, i) => a + cost[i][j], 0);
    const best = Math.min(...perms(n, m).map((pm) => pm.reduce((a, j, i) => a + cost[i][j], 0)));
    assert.ok(Math.abs(total - best) < 1e-9, `case ${t}: ${total} vs ${best}`);
  }
});

test("metrics: pairwise and B-cubed on a hand-checked example", () => {
  // truth {0,1,2} {3,4}; predicted {0,1} {2,3,4}
  const truth = [0, 0, 0, 1, 1];
  const pred = [0, 0, 1, 1, 1];
  const pw = pairwise(pred, truth);
  // predicted pairs: 01, 23, 24, 34 (4); true pairs: 01, 02, 12, 34 (4); both: 01, 34
  assert.equal(pw.tp, 2);
  assert.equal(pw.precision, 0.5);
  assert.equal(pw.recall, 0.5);
  const b = bcubed(pred, truth);
  // precision per record: 1, 1, 1/3, 2/3, 2/3; recall: 2/3, 2/3, 1/3, 1, 1
  assert.ok(Math.abs(b.precision - (1 + 1 + 1 / 3 + 2 / 3 + 2 / 3) / 5) < 1e-12);
  assert.ok(Math.abs(b.recall - (2 / 3 + 2 / 3 + 1 / 3 + 1 + 1) / 5) < 1e-12);
  assert.deepEqual(pairwise(truth, truth).f1, 1);
});
