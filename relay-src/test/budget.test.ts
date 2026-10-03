import { test } from "node:test";
import assert from "node:assert/strict";
import { costUsd, estimateTokens, modelInfo } from "@relay/core";
import { ask, simGateway, tenant } from "./helpers";

const PROMPT = "How do I reset my password on the mobile app, and what happens to my sessions?";

/** What the same request costs with no budget in the way (the simulator is deterministic). */
async function fullCost() {
  const g = simGateway();
  const r = await ask(g, PROMPT);
  assert.equal(r.summary.outcome, "ok");
  return r.summary;
}

test("budget: a stream is cut mid-flight when the tenant's budget runs out", async () => {
  const full = await fullCost();
  const price = modelInfo("claude-sonnet-5-5")!;
  const inputCost = costUsd(full.inputTokens, 0, price);
  assert.ok(full.outputTokens > 30, `the answer is long enough to cut (${full.outputTokens} tokens)`);
  // Room for the prompt and about 40% of the answer.
  const budget = inputCost + 0.4 * (full.costUsd - inputCost);

  const g = simGateway({ tenants: [tenant({ budgetUsd: budget })] });
  const r = await ask(g, PROMPT);
  assert.equal(r.res.status, 200, "the stream started: the cut happens inside it");
  assert.equal(r.summary.outcome, "cut");
  const last = r.events.at(-1)!;
  assert.equal(last.type, "error");
  assert.equal((last as { error: { type: string } }).error.type, "budget_exceeded_error");
  assert.ok(!r.events.some((e) => e.type === "stop"), "no normal stop after a cut");
  assert.ok(r.text.length > 0 && r.text.length < full.outputTokens * 6, "some text, not all of it");

  // Spend may pass the budget by at most the chunk that crossed it.
  const spent = g.gw.spend("t1")!.spentUsd;
  const maxChunk = costUsd(0, Math.max(...r.events.filter((e) => e.type === "text").map((e) => estimateTokens((e as { text: string }).text))), price);
  assert.ok(spent > budget, "the crossing chunk is metered");
  assert.ok(spent <= budget + maxChunk + 1e-12, `spent ${spent} vs budget ${budget} + chunk ${maxChunk}`);

  // The upstream was told to stop: its call is logged as cancelled, not completed.
  const sim = g.sim("claude-sonnet-5-5");
  assert.equal(sim.log.at(-1)!.outcome, "cancelled");
  assert.ok(sim.log.at(-1)!.tokens < full.outputTokens);
  assert.ok(r.summary.decisions.some((d) => d.stage === "meter" && d.label.startsWith("cut at")));

  // With the window spent, the next request is refused before any upstream call.
  const calls = sim.stats.calls;
  const next = await ask(g, "Another question");
  assert.equal(next.res.status, 402);
  assert.equal(next.res.error!.type, "billing_error");
  assert.ok(Number(next.res.headers["retry-after"]) >= 1);
  assert.equal(sim.stats.calls, calls);
  assert.equal(next.summary.outcome, "rejected");
});

test("budget: the window rolls over and spending starts again", async () => {
  const full = await fullCost();
  const g = simGateway({ tenants: [tenant({ budgetUsd: full.costUsd * 1.5, budgetWindowMs: 60_000 })] });
  assert.equal((await ask(g, PROMPT)).summary.outcome, "ok");
  assert.equal((await ask(g, PROMPT)).summary.outcome, "cut");
  assert.equal((await ask(g, PROMPT)).res.status, 402);
  await g.clock.advance(60_000);
  const after = await ask(g, PROMPT);
  assert.equal(after.summary.outcome, "ok");
  assert.ok(Math.abs(g.gw.spend("t1")!.spentUsd - after.summary.costUsd) < 1e-12, "the new window holds only this request");
});

test("metering: estimates while streaming, reconciles to the upstream's count at the end", async () => {
  const g = simGateway();
  const r = await ask(g, PROMPT);
  const stop = r.events.find((e) => e.type === "stop") as { outputTokens: number };
  assert.equal(r.summary.outputTokens, stop.outputTokens);
  const price = modelInfo("claude-sonnet-5-5")!;
  assert.ok(Math.abs(r.summary.costUsd - costUsd(r.summary.inputTokens, r.summary.outputTokens, price)) < 1e-12);
  const rec = g.gw.audit.list({ limit: 1 })[0];
  assert.equal(rec.usage.estimated, false);
});
