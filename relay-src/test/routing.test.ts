import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChain, CATALOG, classify, CONFIGS, profile, requestedTier, STANDARD_RESILIENCE, type Upstream } from "@relay/core";
import { ask, simGateway, tenant } from "./helpers";

const ups = (ids: string[]): Upstream[] => ids.map((id) => ({ id, region: id.split("/")[0], model: id.split("/")[1], kind: "simulator", open: () => Promise.reject(new Error("unused")) }));
const ALL = ups([
  "us-east/claude-opus-5-5",
  "us-east/claude-haiku-4-5",
  "eu-west/claude-haiku-4-5",
  "us-east/claude-sonnet-5-5",
  "eu-west/claude-sonnet-5-5",
  "eu-west/claude-opus-5-5",
]);

test("classifier: code and multi-step questions need the balanced tier, short questions do not", () => {
  assert.equal(classify("Write a TypeScript function that dedupes a list", "standard").tier, "balanced");
  assert.equal(classify("Why does this stack trace mention a null pointer?", "standard").tier, "balanced");
  assert.equal(classify("Compute (12 + 7) * 3.", "standard").tier, "balanced");
  assert.equal(classify("How many requests is 40 per second over 15 minutes?", "standard").tier, "balanced");
  assert.equal(classify("How do I reset my password?", "standard").tier, "fast");
  assert.equal(classify("Let me know when my plan renews", "standard").tier, "fast", "ordinary words like 'let' are not code");
  assert.equal(classify("x".repeat(2000), "standard").reason, "auto: long input");
  assert.equal(classify("Write a TypeScript function", "cost-cut").tier, "fast", "the regression v3 ships");
});

test("model field: tier aliases, auto, concrete model ids, unknown models", () => {
  const cfg = CONFIGS[0];
  assert.deepEqual(requestedTier("relay-best", "", cfg), { tier: "best", reason: "requested" });
  assert.deepEqual(requestedTier("claude-haiku-4-5", "", cfg), { tier: "fast", reason: "model named", pinned: "claude-haiku-4-5" });
  assert.equal(requestedTier("relay-auto", "What is 17 * 23?", cfg)!.tier, "fast");
  assert.equal(requestedTier("gpt-x", "", cfg), null);
});

test("fallback chain: cheapest capable model first, all its regions, then the next model up", () => {
  assert.deepEqual(
    buildChain("fast", ALL).map((u) => u.id),
    ["us-east/claude-haiku-4-5", "eu-west/claude-haiku-4-5", "us-east/claude-sonnet-5-5", "eu-west/claude-sonnet-5-5", "us-east/claude-opus-5-5", "eu-west/claude-opus-5-5"],
  );
  assert.deepEqual(
    buildChain("best", ALL).map((u) => u.id),
    ["us-east/claude-opus-5-5", "eu-west/claude-opus-5-5"],
    "never falls back to a less capable model",
  );
  assert.deepEqual(
    buildChain("balanced", ALL, CATALOG, "claude-opus-5-5").map((u) => u.model),
    ["claude-opus-5-5", "claude-opus-5-5", "claude-sonnet-5-5", "claude-sonnet-5-5"],
    "a pinned model goes first",
  );
});

const down = (region: string, model = "claude-sonnet-5-5") => (m: string, r: string) => profile({ zeroLatency: true, failRate: m === model && r === region ? 1 : 0, mix: { error500: 0, rate429: 0, overloaded529: 1, stall: 0, drop: 0 } });

test("routing fallback: with us-east returning 529 on every call, eu-west serves the request", async () => {
  const g = simGateway({ profile: down("us-east") });
  const r = await ask(g, "How do I reset my password?");
  assert.equal(r.res.status, 200);
  assert.equal(r.summary.upstream, "eu-west/claude-sonnet-5-5");
  assert.equal(r.summary.fellBack, true);
  assert.deepEqual(
    r.summary.decisions.filter((d) => d.stage === "resilience").map((d) => d.label.replace(/\d+ ms/g, "N ms")),
    ["us-east/sonnet-5-5 · 529", "retry #1 in N ms", "us-east/sonnet-5-5 · 529", "fallback → eu-west/sonnet-5-5", "attempt 3 ok"],
  );
  assert.equal(r.res.headers["x-relay-upstream"], "eu-west/claude-sonnet-5-5");
});

test("routing fallback: the same outage with retries only (no fallback) fails the request", async () => {
  const g = simGateway({ profile: down("us-east") });
  g.gw.addConfig({ ...CONFIGS[0], version: "retries-only", resilience: { ...STANDARD_RESILIENCE, fallback: false } });
  const r = await ask(g, "How do I reset my password?", { configVersion: "retries-only" });
  assert.equal(r.res.status, 529);
  assert.equal(r.res.error!.type, "overloaded_error");
  assert.equal(r.summary.attempts, STANDARD_RESILIENCE.maxAttempts);
  assert.equal(g.sim("claude-sonnet-5-5", "eu-west").stats.calls, 0);
});

test("routing fallback: once the breaker opens, the broken deployment is skipped without a call", async () => {
  const g = simGateway({ profile: down("us-east") });
  const sick = g.sim("claude-sonnet-5-5", "us-east");
  for (let i = 0; i < 4; i++) assert.equal((await ask(g, `question ${i}`)).res.status, 200);
  assert.equal(g.gw.breakers.get(sick.id)!.state, "open", "8 failures in a row");
  const calls = sick.stats.calls;
  const r = await ask(g, "How do I reset my password?");
  assert.equal(r.res.status, 200);
  assert.equal(sick.stats.calls, calls, "no call to the open circuit");
  assert.equal(r.summary.attempts, 1);
  assert.ok(r.summary.decisions.some((d) => d.label === "breaker open · skip us-east/sonnet-5-5"));
});

test("routing: a tenant's tier cap refuses an explicit tier and caps auto routing", async () => {
  const g = simGateway({ tenants: [tenant({ maxTier: "fast" })] });
  const best = await ask(g, "How do I reset my password?", { model: "relay-best" });
  assert.equal(best.res.status, 403);
  assert.equal(best.res.error!.type, "permission_error");
  const auto = await ask(g, "Write a TypeScript function named uniqueBy that removes duplicates.", { model: "relay-auto" });
  assert.equal(auto.res.status, 200);
  assert.equal(auto.summary.tier, "fast");
  assert.match(auto.summary.decisions.find((d) => d.stage === "route")!.detail!, /capped at fast/);
  const unknown = await ask(g, "hi", { model: "gpt-x" });
  assert.equal(unknown.res.status, 404);
});
