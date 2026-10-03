import assert from "node:assert/strict";
import { test } from "node:test";
import { simPipelineOptions } from "../src/core/config";
import { Pipeline, type Incident } from "../src/core/pipeline";
import { squash } from "../src/core/rca";
import { Simulator, type FaultSpec } from "../src/core/sim";

/** Warm up 40 simulated minutes, inject, and return the first incident's ranking. */
function incidentFor(fault: Omit<FaultSpec, "startMs">, seed = 17): Incident {
  const pipe = new Pipeline(simPipelineOptions());
  const sim = new Simulator({ seed, startHour: 13, onSpan: (s) => pipe.ingest(s) });
  const inject = 40 * 60_000 + 12_345;
  for (let t = 1000; t <= 55 * 60_000; t += 1000) {
    if (t - 1000 < inject && t >= inject) {
      sim.runUntil(inject);
      sim.inject(fault);
    }
    sim.runUntil(t);
    pipe.advance(t);
    const inc = pipe.openIncident;
    if (inc && inc.rca && inc.openedAt > inject) return inc;
  }
  throw new Error("no incident");
}

test("squash maps noise to zero and grows monotonically", () => {
  assert.equal(squash(1.9), 0);
  assert.ok(squash(3) > 0 && squash(3) < squash(6) && squash(30) < 1);
});

test("a slow database is blamed on the database, not on its callers", () => {
  const inc = incidentFor({ service: "postgres", kind: "latency", magnitude: 25 });
  const top = inc.rca!.ranking[0];
  assert.equal(top.node, "postgres");
  assert.ok(top.zSelf > 5);
  assert.ok(top.selfAfter > top.selfBefore + 15);
});

test("a slow payment provider is found even though the gateway's own queue grows", () => {
  const inc = incidentFor({ service: "payment-provider", kind: "latency", magnitude: 400 });
  const r = inc.rca!;
  assert.equal(r.ranking[0].node, "payment-provider");
  assert.deepEqual(r.ranking[0].path.slice(-2), ["payments", "payment-provider"]);
});

test("an error burst is blamed where the errors start, with the bad version as evidence", () => {
  const inc = incidentFor({ service: "pricing", kind: "deploy", magnitude: 4, rampMs: 30_000 });
  const top = inc.rca!.ranking[0];
  assert.equal(top.node, "pricing");
  assert.ok(top.version && top.version.to !== top.version.from);
});
