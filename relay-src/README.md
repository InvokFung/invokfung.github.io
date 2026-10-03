# Relay

An LLM gateway that makes model calls safe, reliable and accountable. Live at **[invokfung.github.io/relay](https://invokfung.github.io/relay/)**.

The page runs the real gateway package in your browser, in front of simulated model deployments, with synthetic traffic flowing from the moment it opens. Every request is drawn as it moves through the chain; sliders inject failures and latency tails; the playground sends your own prompt through the chain (to the simulator, or to Claude with your own API key); a canary panel rolls config changes out and back. The same package runs as a Node server with an Anthropic-compatible endpoint.

## How it works

A request meets nine middleware stages. Each is a `Middleware` with one method, `handle(ctx, next)`: it can answer itself, reject, rewrite the request, or call `next` and register hooks that see every event of the response stream. The gateway measures each stage's own CPU time on every request. The core has no dependencies and runs unchanged in browsers and Node; time comes from an injected clock, so tests and benchmarks run in virtual time.

| Stage | What | Where |
| --- | --- | --- |
| Audit | Outermost. One record per request, prompts and responses stored redacted, each record hashed with the previous record's hash | `packages/core/src/audit.ts` |
| Auth | API key (looked up by SHA-256) to tenant and policy | `packages/core/src/middleware.ts` |
| Rate limit | Token buckets per tenant for requests/min and tokens/min; tokens reserved on the way in, settled with the real count | `packages/core/src/bucket.ts` |
| Redact | Emails, phones, Luhn-valid cards, mod-97-valid IBANs and names become `<EMAIL_1>`-style placeholders; a per-request vault restores them in the streamed answer, including placeholders split across chunks. One-way masking (`[EMAIL]`) per tenant | `packages/core/src/redact.ts` |
| Screen | Heuristic prompt-injection score over normalised text (noisy-OR of weighted pattern families, encoded payloads decoded and rescreened). Flag adds a guard note to the system prompt; block answers 400 | `packages/core/src/screen.ts` |
| Cache | Exact hash, then MinHash + LSH near match behind a guard (same numbers, placeholders, negation and content words), per tenant, config version, model and system prompt, with per-tenant TTL. Stores redacted answers | `packages/core/src/cache.ts`, `similarity.ts` |
| Route | `relay-auto` picks the cheapest capable tier, capped by the tenant; builds the fallback chain across models and regions | `packages/core/src/routing.ts` |
| Meter | Counts tokens as they stream, prices them, enforces per-tenant budgets (cutting a stream mid-flight), reconciles with the upstream's usage | `packages/core/src/middleware.ts`, `tokens.ts` |
| Resilience | Per-attempt first-token and idle timeouts, retries with full jitter (retry-after as a floor), fallback, a circuit breaker per deployment (Wilson lower bound on the failure share, half-open probes, panic mode), hedged requests after the deployment's p95 first-token time. The first token is the commit point | `packages/core/src/resilience.ts`, `breaker.ts`, `backoff.ts` |

Around the chain: an SSE parser and Anthropic stream decoder/encoder (`sse.ts`, `anthropic.ts`), a deterministic simulator with heavy-tailed latency and injected 500/429/529/stall/drop failures (`sim/`), an eval suite of 16 labelled tasks, and an eval-gated canary controller (`canary.ts`) that moves a config through 5% → 25% → 100% and rolls back on a failing eval, error or latency gate. The error and latency gates use lower confidence bounds, so noise does not roll back a good change.

The page (`src/`) is React; the chain is DOM plus a Canvas 2D overlay, the charts are SVG. The real-Claude mode calls the Messages API straight from the browser with the visitor's key (`anthropic-dangerous-direct-browser-access`), kept in memory only.

## Measured, not guessed

`npm run bench` writes `src/data/bench.json`, which the page imports, and the tables below (between the markers, rewritten on every run).

<!-- bench:start -->
**Gateway overhead** (CPU the gateway adds, zero-latency simulated upstream, 20,000 requests after 3,000 warm-up, Intel(R) Xeon(R) Processor @ 2.10GHz, Node v22.22.0). Self time per stage on the 1,431 upstream-served requests; the 17,985 cache hits skip route, meter and resilience.

| Stage | p50 | p99 |
| --- | --- | --- |
| audit | 56.8 µs | 259.3 µs |
| auth | 4.6 µs | 20.2 µs |
| limit | 3.1 µs | 15 µs |
| redact | 26.7 µs | 83.2 µs |
| screen | 18.1 µs | 62.1 µs |
| cache | 129.7 µs | 407.2 µs |
| route | 15.1 µs | 60.8 µs |
| meter | 20.2 µs | 74 µs |
| resilience | 98.4 µs | 310 µs |
| **whole chain, upstream-served** | **387.4 µs** | **1.21 ms** |
| whole chain, cache hit | 99.5 µs | 410.9 µs |

**30% of calls fail, on every deployment.** Each call to any model in any region fails independently with p = 0.3: 35% HTTP 500, 20% 429 with retry-after, 20% 529 overloaded, 15% stalls (accepted, then silent), 10% dropped streams.

| Policy | Success | p50 | p99 | Attempts / request | Failed mid-stream |
| --- | --- | --- | --- | --- | --- |
| No protection | 71.58% | 934 ms | 1837 ms | 1 | 61 |
| Retries (4 attempts, full jitter) | 97.3% | 1006 ms | 5956 ms | 1.37 | 87 |
| Retries + fallback + breaker | 97.03% | 1004 ms | 5807 ms | 1.37 | 89 |

**Primary region down 30% of the time.** us-east returns 500/529 on every call for 6 s out of every 20 s (and 0.5% otherwise); eu-west is healthy. Failures come in bursts, as real outages do.

| Policy | Success | p50 | p99 | Attempts / request | Failed mid-stream |
| --- | --- | --- | --- | --- | --- |
| No protection | 68.58% | 934 ms | 1880 ms | 1 | 1 |
| Retries (4 attempts, full jitter) | 72.8% | 947 ms | 2486 ms | 1.91 | 2 |
| Retries + fallback + breaker | 99.98% | 970 ms | 2138 ms | 1.07 | 1 |

**Hedging** against a heavy tail (4,000 requests). Time to first token is log-normal around 420 ms (σ 0.35); 8% of calls add a Pareto delay (scale 1.2 s, α 1.3). No failures. Hedge after the upstream's p95 first-token time, at most 1 hedge per 10 requests.

|  | TTFT p50 | TTFT p90 | TTFT p99 | Total p99 | Upstream calls |
| --- | --- | --- | --- | --- | --- |
| No hedging | 434 ms | 759 ms | 4382 ms | 4825 ms | 4052 |
| Hedge at p95 | 434 ms | 759 ms | 1394 ms | 1953 ms | 4348 |

8.7% of requests hedged, +7.3% upstream calls; the hedge won 39% of its races.

**Cache** on a replayed workload of 3,000 requests (ceiling 90.5%: requests whose intent was asked before; verbatim repeats 37.1%). A false hit is an answer served to a different intent.

| Matcher | Hit rate | Exact | Near | False hits | Lookup p50 |
| --- | --- | --- | --- | --- | --- |
| Exact match only | 37.1% | 37.1% | 0% | 0% | 0.9 µs |
| **Exact + MinHash near match, with guard (shipped)** | 70.9% | 15.8% | 55.2% | 0% | 47.3 µs |
| Exact + MinHash, no guard | 93.5% | 11.5% | 82% | 47.84% | 32.9 µs |
| Exact + SimHash (≤ 8 of 64 bits), with guard | 66.2% | 16.9% | 49.4% | 0% | 31.7 µs |
| Exact + SimHash, no guard | 82.1% | 13.9% | 68.2% | 28.21% | 24.1 µs |

On requests in new words for an intent already asked, the shipped matcher answers 83.6% of light rewordings (603), 52% of long-tail re-asks (981) and 0% of true paraphrases (16).

**PII redaction** on 123 labelled messages (37 with look-alikes and no PII) and 40 held-out messages written before the last rule changes.

| Type | Precision | Recall | Held-out precision | Held-out recall |
| --- | --- | --- | --- | --- |
| email | 100% | 100% | 100% | 100% |
| phone | 100% | 95.2% | 100% | 83.3% |
| card | 100% | 100% | 80% | 100% |
| iban | 100% | 100% | 100% | 100% |
| name | 100% | 80% | 100% | 54.5% |
| **all** | 100% | 92.9% | 96% | 80% |

**Prompt-injection screen** (heuristic) on 84 benign and 98 attack prompts, plus 20 + 20 held out.

| Threshold | Precision | Recall | False positives | Held-out precision | Held-out recall | Held-out false positives |
| --- | --- | --- | --- | --- | --- | --- |
| flag ≥ 0.4 | 93.6% | 74.5% | 6% | 100% | 60% | 0% |
| block ≥ 0.7 | 95.1% | 39.8% | 2.4% | 100% | 40% | 0% |

Paraphrased attacks caught: 0/12; non-English: 0/10. It is a pattern screen, and these rows are where it stops.

**Canary rollouts** in virtual time against simulated traffic:

| Candidate | Evals | Outcome | Decided after | Canary requests |
| --- | --- | --- | --- | --- |
| v2 · shorter answers | 16/16, 16/16, 16/16 | promoted | 16.1 s | 112 |
| v3 · cheaper routing | 12/16 | rolled-back: eval gate before 5%: 12/16 passed (failing: math, reasoning, code) | 0 s | 0 |
| v4 · tight timeouts | 16/16 | rolled-back: error rate gate at 5%: 40.0% canary (95% lower bound 11.8%) vs 0.0% stable (limit lower bound ≤ 2.0%) | 3.2 s | 6 |
<!-- bench:end -->

## Run the server

```bash
cd relay-src
npm install
npm run serve        # http://127.0.0.1:8786, simulator upstream
```

```bash
curl -N localhost:8786/v1/messages -H 'x-api-key: relay-demo-acme' -H 'content-type: application/json' \
  -d '{"model":"relay-auto","max_tokens":300,"stream":true,"messages":[{"role":"user","content":"I am Dana Reyes (dana.reyes@example.com). How do I reset my password?"}]}'
curl localhost:8786/metrics                                   # Prometheus text format
curl localhost:8786/audit -H 'x-api-key: relay-demo-acme'     # this tenant's records + chain check
```

`POST /v1/messages` accepts the text subset of the Messages API and answers in the same JSON or SSE shape, with errors in Anthropic's error format. Set `ANTHROPIC_API_KEY` to send traffic to the real API instead of the simulator (models are mapped per tier; hedging is off and timeouts are long in that mode). Other settings: `PORT`, `HOST`, `RELAY_SIM_FAIL_RATE`, `RELAY_SIM_TAIL`, `RELAY_SIM_SEED`, `RELAY_CONFIG`, `RELAY_DRAIN_MS`. Demo tenant keys: `relay-demo-acme`, `relay-demo-globex`, `relay-demo-trial`.

### Docker

```bash
cd relay-src
docker build -t relay .
docker run -p 8786:8786 relay
# behind a TLS-intercepting proxy: docker build --network host --secret id=npm_ca,src=/path/to/ca.pem -t relay .
```

A two-stage build: the server is bundled by esbuild into one file and runs on `node:22-alpine` as the unprivileged `node` user, with a health check on `/healthz` and graceful drain on SIGTERM.

## Rebuild

```bash
cd relay-src
npm install
npm run all     # bench -> test -> build into ../relay (and apps/server/dist)
```

`npm run dev` serves the page on port 8776. `npm test` runs the unit tests (token bucket, backoff bounds, breaker transitions, hedging cancelling the loser, redaction round trip with split placeholders, MinHash/SimHash, the SSE parser on recorded-format fixtures, budget cut-off mid-stream, routing fallback, canary rollback) and end-to-end HTTP tests of the server.

## Next steps

- An embedding-based near match behind the same guard, to catch paraphrases the lexical matcher misses, measured on the same replay.
- A learned injection classifier next to the pattern screen, evaluated on the held-out set, with the patterns kept as a cheap first pass.
- Rollout control on the server (a `/rollouts` endpoint driving the same canary controller), and shared rate-limit and breaker state across instances.
