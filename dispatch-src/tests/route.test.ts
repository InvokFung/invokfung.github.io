import { test } from "node:test";
import assert from "node:assert/strict";
import { Route } from "../src/core/route";
import { Rng } from "../src/core/rng";
import { Traffic } from "../src/core/traffic";
import { randomProblem, simulate } from "./helpers";

const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

test("route: the forward pass agrees with a brute-force walk (rush hour and a traffic event)", () => {
  for (let trial = 0; trial < 60; trial++) {
    const P = randomProblem(`fwd-${trial}`);
    const rng = new Rng(`fwd-seq-${trial}`);
    const seq = rng.shuffle(P.jobs.map((_, i) => i)).slice(0, rng.range(0, 10));
    const r = new Route(P.vehicles[0], seq.slice());
    r.evaluate(P);
    const bf = simulate(P, P.vehicles[0], seq);
    assert.ok(near(r.lateW, bf.lateW), `lateness ${r.lateW} vs ${bf.lateW}`);
    assert.ok(near(r.drive, bf.drive), `drive ${r.drive} vs ${bf.drive}`);
    assert.ok(near(r.ret, bf.ret));
    assert.ok(near(r.cost, bf.cost));
    seq.forEach((_, i) => assert.ok(near(r.startAt(i), bf.starts[i])));
  }
});

test("route: the O(1) slack check says 'nobody after becomes late, cap holds' exactly when a brute-force re-simulation does", () => {
  let cases = 0;
  let free = 0;
  for (let trial = 0; trial < 150; trial++) {
    const P = randomProblem(`slack-${trial}`, { jobs: 14 });
    const rng = new Rng(`slack-seq-${trial}`);
    const order = rng.shuffle(P.jobs.map((_, i) => i));
    const seq = order.slice(0, rng.range(1, 9));
    const v = P.vehicles[0];
    const r = new Route(v, seq.slice());
    r.evaluate(P);
    if (r.over > 0) continue;
    const before = simulate(P, v, seq);
    for (const u of order.slice(seq.length)) {
      for (let p = 0; p < seq.length; p++) {
        // new start at visit p after inserting u before it, timed by hand
        const tr = P.traffic;
        const prevLoc = p === 0 ? v.startLoc : P.jobs[seq[p - 1]].loc;
        const prevDep = p === 0 ? v.startTime : r.depAt(p - 1);
        const J = P.jobs[u];
        const su = Math.max(tr.arrive(P.ff[prevLoc * P.nLoc + J.loc], prevDep), J.e);
        const K = P.jobs[seq[p]];
        const sk = Math.max(tr.arrive(P.ff[J.loc * P.nLoc + K.loc], su + J.dur), K.e);
        const o1 = sk <= r.lsAt(p) + 1e-7;

        const after = simulate(P, v, [...seq.slice(0, p), u, ...seq.slice(p)]);
        const lateAfter = after.late.slice(p + 1); // visits from the old p onwards
        const noNewLate = lateAfter.every((x, i) => x <= before.late[p + i] + 1e-6);
        const capOk = after.ret <= v.hardEnd + 1e-6;
        // skip knife-edge cases within floating-point noise of the boundary
        const margin = Math.abs(sk - r.lsAt(p));
        if (margin < 1e-5) continue;
        assert.equal(o1, noNewLate && capOk, `trial ${trial} u ${u} p ${p}: O(1) ${o1}, brute force late-ok ${noNewLate} cap-ok ${capOk}`);
        cases++;
        if (o1) free++;
      }
    }
  }
  assert.ok(cases > 1000 && free > 100 && cases - free > 100, `${cases} cases, ${free} free`);
});

test("route: priced on lateness alone, every insertion cost equals the brute-force change (rush hour on)", () => {
  for (let trial = 0; trial < 80; trial++) {
    const P = randomProblem(`late-${trial}`, { W: { late: 1, drive: 0, ot: 0, over: 0, move: 0 } });
    const rng = new Rng(`late-seq-${trial}`);
    const order = rng.shuffle(P.jobs.map((_, i) => i));
    const seq = order.slice(0, rng.range(0, 8));
    const v = P.vehicles[0];
    const r = new Route(v, seq.slice());
    r.evaluate(P);
    if (r.over > 0) continue;
    const before = simulate(P, v, seq);
    for (const u of order.slice(seq.length, seq.length + 4)) {
      for (let p = 0; p <= seq.length; p++) {
        const after = simulate(P, v, [...seq.slice(0, p), u, ...seq.slice(p)]);
        const c = r.insertCost(P, u, p);
        if (after.ret > v.hardEnd + 1e-6) assert.equal(c, Infinity);
        else assert.ok(near(c, after.lateW - before.lateW, 1e-6), `trial ${trial} u ${u} p ${p}: ${c} vs ${after.lateW - before.lateW}`);
      }
    }
  }
});

test("route: with constant traffic every insertion cost is exact, and bestInsertion finds the cheapest", () => {
  for (let trial = 0; trial < 80; trial++) {
    const P = randomProblem(`flat-${trial}`, { traffic: Traffic.flat(1.2) });
    const rng = new Rng(`flat-seq-${trial}`);
    const order = rng.shuffle(P.jobs.map((_, i) => i));
    const seq = order.slice(0, rng.range(0, 8));
    const v = P.vehicles[0];
    const r = new Route(v, seq.slice());
    r.evaluate(P);
    if (r.over > 0) continue;
    const before = simulate(P, v, seq);
    for (const u of order.slice(seq.length, seq.length + 4)) {
      let bestBf = Infinity;
      for (let p = 0; p <= seq.length; p++) {
        const after = simulate(P, v, [...seq.slice(0, p), u, ...seq.slice(p)]);
        const c = r.insertCost(P, u, p);
        const want = after.ret > v.hardEnd + 1e-6 ? Infinity : after.cost - before.cost;
        if (want === Infinity) assert.equal(c, Infinity);
        else assert.ok(near(c, want, 1e-6), `trial ${trial} u ${u} p ${p}: ${c} vs ${want}`);
        bestBf = Math.min(bestBf, want);
      }
      const out = { cost: 0, pos: -1 };
      r.bestInsertion(P, u, out);
      if (bestBf === Infinity) assert.equal(out.pos, -1);
      else assert.ok(near(out.cost, bestBf, 1e-6), `best ${out.cost} vs ${bestBf}`);
    }
  }
});

test("route: inserting where bestInsertion says gives exactly the predicted route cost (constant traffic)", () => {
  const P = randomProblem("apply", { traffic: Traffic.flat(), jobs: 16 });
  const v = P.vehicles[0];
  const r = new Route(v, []);
  r.evaluate(P);
  const out = { cost: 0, pos: -1 };
  for (let u = 0; u < P.jobs.length; u++) {
    r.bestInsertion(P, u, out);
    if (out.pos < 0) continue;
    const predicted = r.cost + out.cost;
    r.insert(P, u, out.pos);
    assert.ok(near(r.cost, predicted, 1e-6), `${r.cost} vs ${predicted}`);
    assert.ok(near(r.cost, simulate(P, v, r.seq).cost, 1e-6));
  }
  assert.ok(r.seq.length >= 4);
});

test("route: a job planned on another technician costs exactly W.move more, in the route and in every insertion", () => {
  const P = randomProblem("stability", { traffic: Traffic.flat(), jobs: 14 });
  const v = P.vehicles[0];
  const rng = new Rng("stability-seq");
  const order = rng.shuffle(P.jobs.map((_, i) => i));
  const seq = order.slice(0, 6);
  const plain = new Route(v, seq.slice());
  plain.evaluate(P);
  const costsBefore = order.slice(6).map((u) => [0, 1, 2, 3, 4, 5, 6].map((p) => plain.insertCost(P, u, p)));
  // jobs planned elsewhere (vehicle 7), on this technician (0), or nowhere (-1)
  const homes = P.jobs.map((_, i) => [7, 0, -1][i % 3]);
  const Q = { ...P, jobs: P.jobs.map((j, i) => ({ ...j, home: homes[i] })) };
  const r = new Route(v, seq.slice());
  r.evaluate(Q);
  const moved = seq.filter((u) => homes[u] === 7).length;
  assert.ok(moved > 0);
  assert.ok(near(r.cost, plain.cost + Q.W.move * moved, 1e-9), `${r.cost} vs ${plain.cost} + ${moved} moves`);
  order.slice(6).forEach((u, i) => {
    for (let p = 0; p <= 6; p++) {
      const c = r.insertCost(Q, u, p);
      const want = costsBefore[i][p] + (homes[u] === 7 ? Q.W.move : 0);
      if (want === Infinity) assert.equal(c, Infinity);
      else assert.ok(near(c, want, 1e-9), `u ${u} p ${p}: ${c} vs ${want}`);
    }
  });
});
