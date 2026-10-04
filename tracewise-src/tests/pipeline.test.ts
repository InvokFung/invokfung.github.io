import assert from "node:assert/strict";
import { test } from "node:test";
import { simPipelineOptions } from "../src/core/config";
import { MINUTE_MS, Pipeline, type PipelineEvent } from "../src/core/pipeline";
import { Simulator } from "../src/core/sim";

test("an incident opens on a fault, keeps its ranking once signals recover, then resolves and closes", () => {
  const pipe = new Pipeline(simPipelineOptions());
  const sim = new Simulator({ seed: 7, startHour: 9.4, onSpan: (s) => pipe.ingest(s) });
  const events: { t: number; e: PipelineEvent }[] = [];
  const run = (until: number) => {
    for (let t = sim.now + 2000; t <= until; t += 2000) {
      sim.runUntil(t);
      for (const e of pipe.advance(t)) events.push({ t, e });
    }
  };
  run(36 * MINUTE_MS);
  assert.equal(pipe.alerts.length, 0, "no alerts while healthy");
  const f = sim.inject({ service: "payment-provider", kind: "latency", magnitude: 380, durationMs: 8 * MINUTE_MS });
  run(f.startMs + 25 * MINUTE_MS);
  const opened = events.find((x) => x.e.type === "open")!;
  const closed = events.find((x) => x.e.type === "close")!;
  assert.ok(opened.t - f.startMs < 4 * MINUTE_MS, "detected within four minutes");
  const inc = pipe.incidents[0];
  assert.equal(inc.rca!.ranking[0].node, "payment-provider");
  // Every alert resolved after the fault ended, and the incident closed after that.
  for (const a of pipe.alerts) assert.ok(a.resolvedAt! > f.endMs && a.resolvedAt! < f.endMs + 6 * MINUTE_MS);
  assert.ok(closed && closed.t > Math.max(...pipe.alerts.map((a) => a.resolvedAt!)));
  // No re-ranking on recovered minutes: the last ranking is from while the fault was active.
  const lastRank = events.filter((x) => x.e.type === "rank").at(-1)!;
  assert.ok(lastRank.t <= f.endMs + 2 * MINUTE_MS);
});
