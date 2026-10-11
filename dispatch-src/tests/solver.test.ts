import { test } from "node:test";
import assert from "node:assert/strict";
import { alns, fromSequences, regretInsert, solve } from "../src/core/solver";
import { canServe } from "../src/core/model";
import { randomProblem, simulate } from "./helpers";

test("regret insertion: every job placed on an easy instance, each on a technician with the skill", () => {
  const P = randomProblem("easy", { jobs: 20, vehicles: 8, skills: true });
  for (const k of [1, 2, 3]) {
    const s = fromSequences(P, []);
    regretInsert(P, s, k);
    assert.equal(s.unassigned.length, 0, `regret-${k} left ${s.unassigned.length}`);
    s.routes.forEach((r) => r.seq.forEach((u) => assert.ok(canServe(r.v, P.jobs[u]))));
    const placed = s.routes.flatMap((r) => r.seq).sort((a, b) => a - b);
    assert.deepEqual(placed, P.jobs.map((_, i) => i));
  }
});

test("ALNS: never ends worse than its start, keeps every job, and its cost is what a brute-force walk says", () => {
  const P = randomProblem("alns", { jobs: 40, vehicles: 6, skills: true });
  const s = fromSequences(P, []);
  regretInsert(P, s, 3);
  const { best, stats } = alns(P, s, { iterations: 600, seed: "t" });
  assert.ok(best.cost <= s.cost + 1e-9);
  assert.ok(stats.improvements > 0, "found at least one improvement");
  assert.equal(stats.iterations, 600);
  const placed = best.routes.flatMap((r) => r.seq).concat(best.unassigned).sort((a, b) => a - b);
  assert.deepEqual(placed, P.jobs.map((_, i) => i));
  let total = 0;
  for (const r of best.routes) total += simulate(P, r.v, r.seq).cost;
  for (const u of best.unassigned) total += P.jobs[u].miss;
  assert.ok(Math.abs(total - best.cost) < 1e-6 * Math.max(1, total), `${total} vs ${best.cost}`);
  // the start was not modified (copy on write)
  assert.ok(Math.abs(s.cost - s.routes.reduce((a, r) => a + r.cost, 0) - s.unassigned.reduce((a, u) => a + P.jobs[u].miss, 0)) < 1e-6);
});

test("solver: the same seed gives the same plan, a different seed may not", () => {
  const P = randomProblem("det", { jobs: 35, vehicles: 5, skills: true });
  const a = solve(P, { iterations: 400, seed: "same" });
  const b = solve(P, { iterations: 400, seed: "same" });
  assert.deepEqual(
    a.best.routes.map((r) => r.seq),
    b.best.routes.map((r) => r.seq),
  );
  assert.equal(a.best.cost, b.best.cost);
});
