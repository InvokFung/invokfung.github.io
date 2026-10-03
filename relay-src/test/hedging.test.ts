import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CircuitBreaker,
  DEFAULT_BREAKER,
  RatioBudget,
  Resilience,
  SampleWindow,
  seeded,
  sleep,
  STANDARD_RESILIENCE,
  VirtualClock,
  type AttemptRecord,
  type AttemptSink,
  type Clock,
  type StreamEvent,
  type Upstream,
  type UpstreamCall,
} from "@relay/core";
import { ask, drive, simGateway } from "./helpers";
import { profile } from "@relay/core";

/** An upstream whose first-token time is scripted per call, and which records what happened to each call. */
class Scripted implements Upstream {
  readonly kind = "simulator" as const;
  readonly id: string;
  calls: { aborted: boolean; tokensAfterAbort: number; tokens: number; abortedAt?: number }[] = [];
  constructor(
    readonly region: string,
    readonly model: string,
    private clock: Clock,
    private ttfb: number[],
    private text: string,
  ) {
    this.id = `${region}/${model}`;
  }
  async open(call: UpstreamCall): Promise<AsyncIterable<StreamEvent>> {
    const rec = { aborted: false, tokensAfterAbort: 0, tokens: 0, abortedAt: undefined as number | undefined };
    this.calls.push(rec);
    call.signal.addEventListener("abort", () => {
      rec.aborted = true;
      rec.abortedAt = this.clock.now();
    });
    const delay = this.ttfb[this.calls.length - 1] ?? this.ttfb[this.ttfb.length - 1];
    const clock = this.clock;
    const text = this.text;
    return (async function* () {
      await sleep(clock, delay, call.signal);
      yield { type: "start", model: call.model, inputTokens: 10 } as StreamEvent;
      for (const w of text.split(" ")) {
        if (rec.aborted) rec.tokensAfterAbort++;
        rec.tokens++;
        yield { type: "text", text: w + " " } as StreamEvent;
        await sleep(clock, 10, call.signal);
      }
      yield { type: "stop", reason: "end_turn", outputTokens: rec.tokens } as StreamEvent;
    })();
  }
}

function setup(primaryTtfb: number[], hedgeTtfb: number[]) {
  const clock = new VirtualClock();
  const a = new Scripted("us-east", "m", clock, primaryTtfb, "primary answer here");
  const b = new Scripted("eu-west", "m", clock, hedgeTtfb, "hedge answer here");
  const ttfb = new Map<string, SampleWindow>();
  const breakers = new Map<string, CircuitBreaker>();
  const r = new Resilience({
    clock,
    rng: seeded(1),
    breaker: (u) => breakers.get(u.id) ?? breakers.set(u.id, new CircuitBreaker(u.id, DEFAULT_BREAKER)).get(u.id)!,
    ttfb: (u) => ttfb.get(u.id) ?? ttfb.set(u.id, new SampleWindow(256, 1)).get(u.id)!,
    hedgeBudget: new RatioBudget(1, 10),
  });
  // History: first tokens between 100 and 200 ms, so p95 ≈ 195 ms.
  const w = new SampleWindow(256, 1);
  for (let i = 0; i <= 100; i++) w.add(100 + i);
  ttfb.set(a.id, w);
  const decisions: string[] = [];
  const attempts: AttemptRecord[] = [];
  const ctrl = new AbortController();
  const sink: AttemptSink = { signal: ctrl.signal, attempts, decide: (_t, l) => decisions.push(l), waitUs: 0 };
  return { clock, a, b, r, sink, decisions, attempts, ctrl };
}

async function collect(gen: AsyncGenerator<StreamEvent>) {
  let text = "";
  for await (const ev of gen) if (ev.type === "text") text += ev.text;
  return text.trim();
}

test("hedging: a slow primary is hedged at the p95 delay, the hedge wins, and the primary is cancelled", async () => {
  const { clock, a, b, r, sink, decisions, attempts } = setup([5000], [100]);
  const cfg = { ...STANDARD_RESILIENCE, hedge: { quantile: 0.95, minSamples: 20, floorMs: 10 } };
  const text = await drive(
    clock,
    (async () => {
      const c = await r.call(sink, [a, b], { messages: [{ role: "user", content: "hi" }], maxTokens: 50 }, cfg);
      assert.equal(c.upstream, b);
      return collect(c.events);
    })(),
  );
  assert.equal(text, "hedge answer here");
  assert.equal(a.calls.length, 1);
  assert.equal(b.calls.length, 1);
  // The hedge went out at p95 (≈195 ms) and produced its first token 100 ms later.
  const hedge = attempts.find((x) => x.kind === "hedge")!;
  assert.ok(Math.abs(hedge.startedAt - 195) < 1, `hedge started at ${hedge.startedAt}`);
  assert.equal(hedge.outcome, "won");
  // The loser was aborted the moment the hedge won, and produced nothing after.
  assert.equal(a.calls[0].aborted, true);
  assert.ok(Math.abs(a.calls[0].abortedAt! - 295) < 1, `primary aborted at ${a.calls[0].abortedAt}`);
  assert.equal(a.calls[0].tokens, 0);
  assert.equal(a.calls[0].tokensAfterAbort, 0);
  assert.equal(attempts.find((x) => x.kind === "primary")!.outcome, "cancelled");
  assert.ok(decisions.includes("hedge won"));
  assert.equal(b.calls[0].aborted, false, "the winner keeps streaming");
});

test("hedging: a primary faster than p95 never triggers a hedge", async () => {
  const { clock, a, b, r, sink, attempts } = setup([120], [100]);
  const cfg = { ...STANDARD_RESILIENCE, hedge: { quantile: 0.95, minSamples: 20, floorMs: 10 } };
  const text = await drive(
    clock,
    (async () => collect((await r.call(sink, [a, b], { messages: [{ role: "user", content: "hi" }], maxTokens: 50 }, cfg)).events))(),
  );
  assert.equal(text, "primary answer here");
  assert.equal(b.calls.length, 0);
  assert.equal(attempts.length, 1);
});

test("hedging: when the primary wins the race after all, the hedge is the one cancelled", async () => {
  // Primary first token at 250 ms; hedge sent at ≈195 ms would answer at 395 ms.
  const { clock, a, b, r, sink, attempts, decisions } = setup([250], [200]);
  const cfg = { ...STANDARD_RESILIENCE, hedge: { quantile: 0.95, minSamples: 20, floorMs: 10 } };
  const text = await drive(
    clock,
    (async () => collect((await r.call(sink, [a, b], { messages: [{ role: "user", content: "hi" }], maxTokens: 50 }, cfg)).events))(),
  );
  assert.equal(text, "primary answer here");
  assert.equal(b.calls.length, 1);
  assert.equal(b.calls[0].aborted, true);
  assert.equal(b.calls[0].tokens, 0);
  assert.equal(attempts.find((x) => x.kind === "hedge")!.outcome, "cancelled");
  assert.ok(decisions.includes("primary won"));
});

test("hedging: without enough latency history there is no p95, so no hedge", async () => {
  const { clock, a, b, r, sink } = setup([300], [100]);
  const cfg = { ...STANDARD_RESILIENCE, hedge: { quantile: 0.95, minSamples: 500, floorMs: 10 } };
  await drive(
    clock,
    (async () => collect((await r.call(sink, [a, b], { messages: [{ role: "user", content: "hi" }], maxTokens: 50 }, cfg)).events))(),
  );
  assert.equal(b.calls.length, 0);
});

test("hedging through the whole gateway: the simulator logs the loser as cancelled", async () => {
  // us-east is slow on every call (heavy, fixed delay); eu-west is quick.
  const g = simGateway({
    profile: (_m, r) => profile({ ttfbMedianMs: r === "us-east" ? 150 : 60, ttfbSigma: 0.01, tail: { p: 0, scaleMs: 1, alpha: 2 }, tokensPerSec: 10_000 }),
    extra: { hedgeRatio: 1 },
  });
  // Warm up us-east's latency history (25 fast-enough calls), then make it slow.
  for (let i = 0; i < 25; i++) await ask(g, `warm-up question number ${i}`);
  const us = g.sim("claude-sonnet-5-5", "us-east");
  us.profile = () => profile({ ttfbMedianMs: 3000, ttfbSigma: 0.01, tail: { p: 0, scaleMs: 1, alpha: 2 }, tokensPerSec: 10_000 });
  const before = us.stats.cancelled;
  const r = await ask(g, "How do I reset my password?");
  assert.equal(r.res.status, 200);
  assert.equal(r.summary.hedged, true);
  assert.equal(r.summary.hedgeWon, true);
  assert.equal(r.summary.upstream, "eu-west/claude-sonnet-5-5");
  assert.equal(us.stats.cancelled, before + 1, "the slow primary was cancelled");
  assert.equal(us.log[us.log.length - 1].tokens, 0);
  assert.ok(r.summary.latencyMs < 500, `latency ${r.summary.latencyMs} ms instead of ~3000`);
});
