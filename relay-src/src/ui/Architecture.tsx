// How it works: the chain, then the design decisions and what each one costs.
// Parameters are read from the code's own constants.

import { DEFAULT_BREAKER, DEFAULT_GATES, DEFAULT_HEDGE_RATIO, LSH_BANDS, LSH_ROWS, MINHASH_K, STANDARD_RESILIENCE, TENANTS } from "@relay/core";
import { bench } from "../data";

const R = STANDARD_RESILIENCE;
const B = DEFAULT_BREAKER;
const G = DEFAULT_GATES;
const ACME = TENANTS[0];
const NOGUARD = bench.cache.variants.find((v) => v.id === "minhash-noguard");

const CHAIN: { name: string; what: string; file: string }[] = [
  { name: "Audit", what: "Outermost, so it sees every outcome, rejections included. Appends one redacted, hash-chained record per request.", file: "audit.ts" },
  { name: "Auth", what: "Looks the API key up by its SHA-256 and attaches the tenant's policy: limits, budget, redaction mode, screen thresholds, top tier.", file: "middleware.ts" },
  { name: "Rate limit", what: "Two token buckets per tenant: requests and tokens per minute. Tokens are reserved on the way in and settled with the real count.", file: "bucket.ts" },
  { name: "Redact", what: "Emails, phones, Luhn-valid cards, mod-97-valid IBANs and names become placeholders; a per-request vault restores them in the stream.", file: "redact.ts" },
  { name: "Screen", what: "Scores the user text for injection. Flag adds a guard note to the system prompt; block answers 400 without calling a model.", file: "screen.ts" },
  { name: "Cache", what: "Exact hash, then MinHash near match behind a guard, scoped per tenant, config version, model and system prompt. Stores the redacted answer, never PII.", file: "cache.ts" },
  { name: "Route", what: "relay-auto picks the cheapest tier whose capability fits the prompt, capped by the tenant; builds the fallback chain across models and regions.", file: "routing.ts" },
  { name: "Meter", what: "Counts tokens as they stream, prices them, enforces the tenant's budget (cutting a stream mid-flight) and reconciles with the upstream's usage.", file: "middleware.ts" },
  { name: "Resilience", what: "Per-attempt timeouts, retries with full jitter, fallback, a circuit breaker per deployment and hedged requests, up to the first token.", file: "resilience.ts" },
];

export function Architecture() {
  return (
    <section className="sec" id="architecture">
      <p className="eyebrow">Architecture</p>
      <h2>A typed middleware chain</h2>
      <p className="sub">
        Each stage is a <code>Middleware</code> with one method, <code>handle(ctx, next)</code>: it can answer itself, reject, rewrite the request, or call <code>next</code> and register hooks that see every event of the response stream.
        The gateway times each stage's own work, so the trace under every request shows where the microseconds went. The core package has no dependencies and runs unchanged in this tab and in Node.
      </p>
      <ol className="arch-chain">
        {CHAIN.map((c) => (
          <li className="panel" key={c.name}>
            <b>{c.name}</b>
            <span>{c.what}</span>
            <code>{c.file}</code>
          </li>
        ))}
      </ol>

      <div className="decisions-grid">
        <div className="panel decision">
          <h3>Why full jitter</h3>
          <p>
            A retry waits a uniform random time in [0, min({R.backoff.capMs} ms, {R.backoff.baseMs} ms × 2ⁿ)], and never less than a server's retry-after. Clients that failed together spread over the whole window instead of returning in
            step, which is how one overloaded second becomes a retry storm. Equal jitter keeps a minimum wait; full jitter gives up that floor for less total contention.
          </p>
          <p className="tradeoff">Trade-off: an unlucky request can retry almost at once or wait the full ceiling, so single-request latency is noisier. The fleet recovers faster.</p>
        </div>
        <div className="panel decision">
          <h3>Why hedge at p{Math.round((R.hedge?.quantile ?? 0.95) * 100)}</h3>
          <p>
            Each deployment keeps its recent first-token times. If a request has no token by that deployment's p{Math.round((R.hedge?.quantile ?? 0.95) * 100)} (once it has {R.hedge?.minSamples} samples, never below {R.hedge?.floorMs} ms),
            a second attempt starts on the next deployment in the chain; the first token wins and the loser is cancelled. Only requests slower than that quantile can trigger it, and a budget caps hedges at {DEFAULT_HEDGE_RATIO} per request
            on average, so a slow upstream cannot double the load on everything else.
          </p>
          <p className="tradeoff">Trade-off: a hedge costs a second call, billed for whatever it consumed before cancellation. A lower quantile cuts more tail and spends more; with real API keys it is off.</p>
        </div>
        <div className="panel decision">
          <h3>Reversible vs one-way redaction</h3>
          <p>
            Reversible mode swaps each value for a numbered placeholder (<code>&lt;EMAIL_1&gt;</code>) and keeps the mapping in a vault that lives as long as the request. The model can still say "we'll write to <code>&lt;EMAIL_1&gt;</code>"
            and the client sees the real address, restored as the text streams, even when a placeholder arrives split across chunks (the restorer holds back at most one partial placeholder, under 12 characters). One-way mode writes{" "}
            <code>[EMAIL]</code> and keeps nothing.
          </p>
          <p className="tradeoff">Trade-off: reversible gives personal answers but holds PII in gateway memory for the request and trusts the model to copy placeholders exactly. One-way holds nothing and answers more generically.</p>
        </div>
        <div className="panel decision">
          <h3>What a heuristic injection screen can and cannot do</h3>
          <p>
            It can catch the attacks people copy and paste (instruction overrides, requests for the hidden prompt, fake chat-template tags, encoded or zero-width payloads) for a few microseconds, and it makes every attempt visible in the
            audit log. Above {ACME.screen.flag} the request goes on with a guard note; above {ACME.screen.block} it stops at the gateway.
          </p>
          <p className="tradeoff">
            It cannot understand intent. A paraphrase that avoids every pattern passes, and so does an attack in a language the patterns do not cover; the measured numbers show both. Treat it as one layer next to least-privilege tools and
            output checks, not as the defence.
          </p>
        </div>
        <div className="panel decision">
          <h3>The commit point is the first token</h3>
          <p>
            Until the first token reaches the client, any failure (a 5xx, a 529, a stall past {R.firstTokenTimeoutMs / 1000} s, a dropped connection) is invisible: the gateway retries, falls back or hedges. After it, part of the answer is
            already on screen, so a stream that breaks is ended with an error event rather than restarted, which would repeat text. Up to {R.maxAttempts} attempts, {R.attemptsPerUpstream} per deployment before moving down the chain.
          </p>
          <p className="tradeoff">Trade-off: buffering whole answers would make every failure retryable and remove streaming. Streaming wins; the cost is the small share of requests that fail mid-answer.</p>
        </div>
        <div className="panel decision">
          <h3>A breaker that waits for evidence</h3>
          <p>
            Each deployment keeps its last {B.window} outcomes. The circuit opens when the 95% Wilson lower bound of their failure share reaches {Math.round(B.failureRate * 100)}% (and at least {B.minRequests} calls), so three unlucky
            errors do not take a healthy region out, while a dead one trips after {B.minRequests} calls. 429s are not counted: they are backpressure, answered by retry-after. Open lasts {B.cooldownMs / 1000} s, doubling to{" "}
            {B.maxCooldownMs / 1000} s on repeated trips; {B.probes} probe successes close it.
          </p>
          <p className="tradeoff">
            Trade-off: a bound reacts a few calls later than a raw ratio. And when every circuit in a chain is open, the gateway still sends to the first one rather than refusing everything: a guess beats a guaranteed 503.
          </p>
        </div>
        <div className="panel decision">
          <h3>A near-duplicate cache that refuses to guess</h3>
          <p>
            Prompts are normalised and shingled, signed with {MINHASH_K} MinHash values and indexed in {LSH_BANDS} LSH bands of {LSH_ROWS}, so a lookup touches a few buckets instead of every entry. A candidate above {ACME.cache?.threshold}{" "}
            estimated Jaccard still has to pass the guard: same numbers, same placeholders, same negation, same content words (one typo allowed).{" "}
            {NOGUARD ? `Without the guard, ${NOGUARD.falseHitRate}% of near-match hits on the benchmark workload served another question's answer.` : null}
          </p>
          <p className="tradeoff">Trade-off: no embedding model, so paraphrases in different words miss. In exchange: no dependency, microsecond lookups, and no confident wrong answers.</p>
        </div>
        <div className="panel decision">
          <h3>Rollouts gated on evals and live errors</h3>
          <p>
            A new config runs the eval suite against the simulator before each step (pass rate ≥ {Math.round(G.minEvalPassRate * 100)}%), then takes its share of live traffic. During the step, the Wilson lower bound of its error rate must
            stay within {Math.round(G.maxErrorIncrease * 100)} points of stable, and a distribution-free lower bound on its p95 within {G.maxP95Ratio}× stable's. Cache hits are left out of both, since they do not exercise the config. Any
            failing gate rolls back at once; a step without enough traffic also rolls back.
          </p>
          <p className="tradeoff">Trade-off: evals on a simulator test the gateway's configuration (routing, prompts, timeouts), not model quality. That is why the live gates exist: v4 passes every eval and still fails in traffic.</p>
        </div>
      </div>
    </section>
  );
}
