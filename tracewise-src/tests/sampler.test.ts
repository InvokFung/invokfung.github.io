import assert from "node:assert/strict";
import { test } from "node:test";
import { simPipelineOptions } from "../src/core/config";
import { Pipeline } from "../src/core/pipeline";
import { Rng } from "../src/core/rng";
import { TailSampler } from "../src/core/sampler";
import { Simulator } from "../src/core/sim";
import { Kind } from "../src/core/types";
import { span } from "./helpers";

test("every error trace is kept, even with the token bucket empty", () => {
  const s = new TailSampler({ ratePerSec: 0.1, burst: 1, windowMin: 10, minForP99: 10 });
  let kept = 0;
  for (let i = 0; i < 1000; i++) if (s.decide("f", 10, true, i)) kept++;
  assert.equal(kept, 1000);
  assert.equal(s.byReason.error, 1000);
});

test("traces slower than the rolling p99 are kept; ordinary ones are rate-limited", () => {
  const rng = new Rng(3);
  const s = new TailSampler({ ratePerSec: 1, burst: 5, windowMin: 10, minForP99: 200 });
  // Warm the window with a minute of ordinary latencies.
  for (let i = 0; i < 2000; i++) s.decide("f", rng.lognormal(20, 0.3), false, i * 30);
  s.roll();
  const p99 = s.p99("f")!;
  assert.ok(p99 > 30 && p99 < 50, `p99 ${p99}`);
  const t0 = 60_000;
  let slow = 0;
  let sampled = 0;
  const seconds = 60;
  for (let i = 0; i < 6000; i++) {
    const now = t0 + (i * seconds * 1000) / 6000;
    const d = i % 50 === 0 ? p99 * 3 : 20;
    const r = s.decide("f", d, false, now);
    if (d > p99) {
      assert.equal(r, "slow");
      slow++;
    } else if (r === "sampled") sampled++;
  }
  assert.equal(slow, 120);
  // At most the burst plus the refill over the interval.
  assert.ok(sampled <= 5 + seconds * 1 + 1, `${sampled} sampled`);
  assert.ok(sampled >= seconds - 1);
});

test("the pipeline keeps every error trace while a fault is active, and retains a small share overall", () => {
  const pipe = new Pipeline(simPipelineOptions());
  const sim = new Simulator({ seed: 21, onSpan: (s) => pipe.ingest(s) });
  sim.runUntil(60_000);
  sim.inject({ service: "inventory", kind: "errors", magnitude: 0.05 });
  for (let t = 1000; t <= 600_000; t += 1000) {
    sim.runUntil(t);
    pipe.advance(t);
  }
  assert.ok(pipe.errorTraces > 100);
  assert.equal(pipe.errorKept, pipe.errorTraces);
  const retention = pipe.sampler.kept / pipe.sampler.seen;
  assert.ok(retention < 0.2, `retention ${retention}`);
  for (const t of pipe.store) if (t.error) assert.equal(t.reason, "error");
});

test("an error span that arrives after the decision is still kept", () => {
  const opts = simPipelineOptions({ sampler: { ratePerSec: 0, burst: 0, windowMin: 10, minForP99: 1e9 } });
  const pipe = new Pipeline(opts);
  const trace = "a".repeat(32);
  pipe.ingest(span("r", "", "gateway", 0, 50, { trace, name: "POST /checkout" }));
  pipe.ingest(span("p", "r", "orders", 10, 11, { trace, kind: Kind.PRODUCER }));
  pipe.advance(10_000); // decided: no error yet, no tokens, so dropped
  assert.equal(pipe.store.length, 0);
  pipe.ingest(span("q", "p", "notifications", 9_000, 12_000, { trace, kind: Kind.CONSUMER, error: true }));
  pipe.advance(30_000);
  assert.equal(pipe.lateSpans, 1);
  assert.equal(pipe.store.length, 1);
  assert.equal(pipe.store[0].partial, true);
  assert.equal(pipe.errorKept, pipe.errorTraces);
});
