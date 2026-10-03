# Tracewise

Distributed tracing, anomaly detection and root-cause ranking, running in the browser over a simulated microservice system. Live at **[invokfung.github.io/tracewise](https://invokfung.github.io/tracewise/)**.

The page opens on a live console: a checkout system of 11 services (gateway, auth, orders, cart, payments, inventory, pricing, an async e-mail consumer, a Postgres database, a Redis cache and a third-party card API) running at 60× real time in a Web Worker. Requests move across a service map as they happen. A chaos panel injects added latency, errors, lost capacity, dependency timeouts or a bad deploy at a chosen time; the pipeline detects the change, opens an incident and ranks the services most likely to have caused it, with the evidence for each, while a waterfall shows an exemplar trace with its critical path. Everything shown is computed in the tab: the traffic is simulated and labelled as such, and real OTLP/JSON files can be dropped in for the same analysis.

## How it works

The simulator emits OpenTelemetry-shaped spans as they end. One pipeline turns them into traces, metrics, alerts and a ranking. The browser and the evaluation use the same modules and the same settings (`src/core/config.ts`).

| Step | What | Where |
| --- | --- | --- |
| Simulate | Discrete-event simulation: per-service worker pools (a request holds its worker while it waits on dependencies, so slowness cascades), lognormal service times, per-endpoint call graphs with fan-out, timeouts, retries with backoff, cache misses and fallbacks, a Kafka-style consumer with redelivery, diurnal Poisson arrivals. Seeded and deterministic. Databases, the cache and the card API emit no spans; they are seen through their callers' client spans | `src/core/sim.ts`, `src/core/topology.ts` |
| Assemble | Spans arrive out of order. A trace is built once its root has ended plus a 5 s decision wait; orphans after 60 s. Spans that arrive after the decision become fragments that follow it | `src/core/pipeline.ts`, `src/core/tracetree.ts` |
| Measure | From every trace, before sampling: RED metrics per service-map node and per call edge, exclusive (self) time as duration minus the union of child intervals, errors that start at a node (not those passed up from a dependency, and not cancellations), all percentiles from a DDSketch (α = 1%) written from scratch | `src/core/sketch.ts`, `src/core/tracetree.ts` |
| Sample | Tail-based: keep every trace with an error, every trace slower than its flow's rolling p99 (a 10-minute window of mergeable, subtractable sketches), and a token-bucket sample of the rest | `src/core/sampler.ts` |
| Detect | Per flow and minute: EWMA forecast, MAD-scaled robust z-score and a one-sided CUSUM on log p95 and on the error ratio (binomial z). The baseline stops learning during an alarm. SLO alerts use the SRE workbook's multi-window, multi-burn-rate rules (1 h and 5 min at 14.4×, 6 h and 30 min at 6×) in simulated time. Alerts resolve after three calm minutes | `src/core/anomaly.ts`, `src/core/slo.ts` |
| Rank | Score = 0.6 · blame walk + 0.2 · anomaly + 0.2 · critical-path share. Anomaly: the stronger z-score of a node's self time and own errors, against the 30 minutes before the onset. Blame walk: personalised PageRank from caller to callee, edges weighted by how much each call changed, restarts weighted by anomaly. Critical-path diff: where the added end-to-end time went, from kept traces reweighted by their sampling rates | `src/core/rca.ts`, `src/core/pagerank.ts` |
| Real data | OTLP/JSON `ExportTraceServiceRequest`: hex or base64 ids, enum names or numbers, `scopeSpans` or the older `instrumentationLibrarySpans`. Builds the service map, RED table and waterfalls with the same code | `src/core/otlp.ts`, `src/core/analyze.ts` |
| Page | React for the panels; the service map is Canvas 2D with a layered graph layout written for it; timeline, waterfall and charts are SVG. Simulator and pipeline run in a Web Worker | `src/worker/`, `src/ui/`, `src/core/layout.ts` |

The only runtime dependencies are React and React DOM.

## Measured, not guessed

`npm run eval` (`scripts/eval.ts`) runs seeded fault scenarios across worker threads. Each one picks a service, a fault type, a size and a time of day, warms the pipeline up for an hour, injects the fault and watches for 20 minutes; the fault-free runs count false alarms and compare every sketch percentile against the exact value. The baselines rank the same nodes from the same minute summaries: the service with the highest p99, the one whose p99 rose most, and the service nearest the alert. A fault counts as user-visible when, in its first five minutes, some flow's p95 rose by 25% or its error rate by half a point, the same bars the alerts use. The script writes `src/generated/eval.json`, which the page imports, and the tables below.

<!-- eval:start -->
Seed 2026 (held out; the method was developed on seed 1): 200 fault scenarios and 12 fault-free runs of 4 simulated hours, 171,663,973 spans.

| Measure | Result |
| --- | --- |
| Root cause ranked first / in top 3 | **98.9%** / 100.0% of 177 detected faults |
| Detection latency (simulated time) | median 2.04 min, p90 3.96 min |
| Faults detected | 171/171 user-visible, 177/200 overall |
| False alarms | 0 in 42 fault-free hours (0/h); 0 in 101.66 h before injections |
| Traces kept by the tail sampler | 5.1%, with 100% of error traces (4,842/4,842) |
| DDSketch relative error, p50 / p95 / p99 | mean 0.5% / 0.5% / 0.5%, max 1.0% / 1.0% / 1.0% over 8,604 flow-minutes |
| Ingest throughput, one thread | 653,406 spans/s (simulator 320,200 spans/s; end to end 161,459 spans per CPU-second) |

| Ranking method | Top 1 | Top 3 | Top 1 on 62 cascades |
| --- | --- | --- | --- |
| **Tracewise** | 98.9% | 100.0% | 100.0% |
| Biggest p99 jump | 66.1% | 83.0% | 74.2% |
| Service that alerted | 17.0% | 43.5% | 1.6% |
| Highest p99 | 10.2% | 32.2% | 4.8% |
| Ablation: anomaly only | 97.7% | 100.0% | 95.2% |
| Ablation: walk weighted by node anomaly | 99.4% | 100.0% | 100.0% |
| Ablation: no critical path | 98.9% | 99.4% | 100.0% |
| Ablation: walk only | 98.9% | 99.4% | 100.0% |

| Fault type | Runs | User-visible caught | Median detection | Tracewise top 1 | Biggest p99 jump top 1 |
| --- | --- | --- | --- | --- | --- |
| latency | 40 | 31/31 | 1.85 min | 97.1% | 73.5% |
| errors | 32 | 32/32 | 2.42 min | 96.9% | 9.4% |
| capacity | 40 | 22/22 | 1.72 min | 100.0% | 60.9% |
| timeout | 50 | 48/48 | 1.95 min | 100.0% | 90.0% |
| deploy | 38 | 38/38 | 2.58 min | 100.0% | 79.0% |
<!-- eval:end -->

`npm test` (node:test via tsx) covers the sketch's error bound, merge and subtraction; EWMA, MAD and CUSUM; burn-rate arithmetic and the two-window rule; the sampler's guarantees, including late error spans; span trees, exclusive time, own errors and the critical path; PageRank against a closed form; the layout; simulator determinism; the OTLP parser and a round trip through it; and end-to-end incidents (detection, ranking, resolution).

### Limits worth knowing

- The simulator is cleaner than production: one fault at a time, synchronised clocks, every service instrumented the same way, and no sampling upstream of the pipeline. The scores say the method works on this system, not that it would score the same on yours.
- The two top-1 misses on the held-out seed: an error burst at the gateway itself during night-time traffic, where a single stray error at payments (about one request in a hundred) made payments a strong enough sink in the blame walk to edge the gateway into second place; and a payment-provider slowdown too small for users to notice (+6% p95), ranked third behind postgres and redis.
- The pieces of the ranking overlap: on the held-out seed, the ablation that weights the walk by node anomaly instead of call anomaly scored one fault higher than the full method (on the development seed it scored three lower). Differences of one to three scenarios out of 177 are within noise.
- Lost capacity on a service with idle workers is invisible until traffic grows; most of the undetected faults are of that kind, and all of them were below the visibility bar.
- Uploaded files get the map, metrics and waterfalls, not anomaly detection: a single file has no baseline to compare against.

## Rebuild

```bash
cd tracewise-src
npm install
npm run all     # eval -> test -> build into ../tracewise
```

`npm run dev` and `npm run preview` serve on port 8775. `npm run eval -- --n 50 --clean 4` gives a quicker, smaller run; `--seed`, `--hours` and `--workers` are also accepted. The page itself needs no build-time data apart from `src/generated/eval.json`.

## Next steps

- An OTLP/HTTP receiver in front of the same pipeline, so a real OpenTelemetry Collector can export to it.
- ClickHouse for the kept traces and the per-minute summaries, with the browser querying it, so history outlives the tab.
- Scenarios with two simultaneous faults, clock skew and partly instrumented services, to find where the ranking breaks.
