import { test } from "node:test";
import assert from "node:assert/strict";
import { allPairs, buildGraph, pathBetween, type Edge } from "../src/core/graph";
import { generateCity } from "../src/core/city";
import { Rng } from "../src/core/rng";

function floyd(n: number, edges: Edge[]): Float64Array {
  const d = new Float64Array(n * n).fill(Infinity);
  for (let i = 0; i < n; i++) d[i * n + i] = 0;
  for (const e of edges) {
    d[e.a * n + e.b] = Math.min(d[e.a * n + e.b], e.w);
    d[e.b * n + e.a] = Math.min(d[e.b * n + e.a], e.w);
  }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (d[i * n + k] + d[k * n + j] < d[i * n + j]) d[i * n + j] = d[i * n + k] + d[k * n + j];
  return d;
}

test("shortest paths: Dijkstra from every node matches Floyd-Warshall on random graphs, and paths add up", () => {
  const rng = new Rng("graphs");
  for (let trial = 0; trial < 25; trial++) {
    const n = rng.range(2, 18);
    const edges: Edge[] = [];
    const m = rng.range(n - 1, n * 3);
    for (let i = 0; i < m; i++) edges.push({ a: rng.int(n), b: rng.int(n), w: Math.round(rng.uniform(0.5, 9) * 100) / 100 });
    const ap = allPairs(buildGraph(n, edges));
    const fw = floyd(n, edges);
    const w = new Map<string, number>();
    for (const e of edges) {
      const k1 = `${e.a}-${e.b}`;
      const k2 = `${e.b}-${e.a}`;
      w.set(k1, Math.min(w.get(k1) ?? Infinity, e.w));
      w.set(k2, Math.min(w.get(k2) ?? Infinity, e.w));
    }
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const d = ap.dist[a * n + b];
        if (fw[a * n + b] === Infinity) {
          assert.equal(d, Infinity);
          continue;
        }
        assert.ok(Math.abs(d - fw[a * n + b]) < 1e-9, `trial ${trial} ${a}->${b}: ${d} vs ${fw[a * n + b]}`);
        const path = pathBetween(ap, a, b);
        assert.equal(path[0], a);
        assert.equal(path[path.length - 1], b);
        let len = 0;
        for (let i = 1; i < path.length; i++) len += w.get(`${path[i - 1]}-${path[i]}`)!;
        assert.ok(Math.abs(len - d) < 1e-9);
      }
    }
  }
});

test("city: connected, symmetric, and the river is crossed only on bridges", () => {
  const city = generateCity();
  const n = city.ap.n;
  for (let a = 0; a < n; a += 7) {
    for (let b = 0; b < n; b += 5) {
      assert.ok(Number.isFinite(city.ap.dist[a * n + b]));
      assert.ok(Math.abs(city.ap.dist[a * n + b] - city.ap.dist[b * n + a]) < 1e-9);
    }
  }
  const riverY = (x: number) => {
    const r = city.river;
    for (let i = 1; i < r.length; i++) if (r[i][0] >= x) return r[i - 1][1] + ((r[i][1] - r[i - 1][1]) * (x - r[i - 1][0])) / (r[i][0] - r[i - 1][0]);
    return r[r.length - 1][1];
  };
  const crossing = city.roads.filter((rd) => Math.sign(city.ys[rd.a] - riverY(city.xs[rd.a])) !== Math.sign(city.ys[rd.b] - riverY(city.xs[rd.b])));
  assert.ok(crossing.length >= 3, "at least three bridges");
  for (const rd of crossing) assert.equal(rd.cls, 2, "every crossing is a bridge");
});
