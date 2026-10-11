# Dispatch

Field-service dispatch that re-plans the day when the day changes. Technicians have skills, shifts and a depot; jobs have a place, a booked window, a duration, a skill and a priority. When a technician calls in sick at nine, an urgent job comes in at twenty past eleven, a job runs long or traffic jams, Dispatch freezes what is under way and re-plans the rest in about 50 ms. Live at **[invokfung.github.io/dispatch](https://invokfung.github.io/dispatch/)**.

Everything is synthetic: the city, the technicians, the jobs and the traffic come from seeds. The page regenerates the day in a Web Worker and checks it against a SHA-256 recorded at build time.

## How it works

Every part is a typed module in `src/core/` with no runtime dependency. The Web Worker, the evaluation script and the tests all use the same modules, so the page runs the code that was measured.

| Step | What | Where |
| --- | --- | --- |
| Data | Seeded generator (cyrb128 + sfc32). A city grid with arterials and a river crossed by five bridges; 8–12 technicians with skills, shifts and a depot; 60–120 jobs with slot, half-day or all-day windows, lognormal durations and three priorities | `src/core/rng.ts`, `city.ts`, `day.ts` |
| Roads | CSR graph, Dijkstra with a binary heap from every intersection, paths kept for drawing | `src/core/graph.ts` |
| Traffic | A rush-hour profile times any traffic you add. Speeds change in steps (Ichoua, Gendreau and Potvin), so travel is FIFO: leaving later never arrives sooner. Arrival and latest departure are table lookups | `src/core/traffic.ts` |
| Routes | Arrival, start and departure per visit, plus two latest-start times: one that adds no lateness downstream and keeps the overtime cap, one that keeps the return time. An insertion is checked in O(1), exactly, even under rush hour; only when it adds lateness is the rest of the route re-timed to price it | `src/core/route.ts` |
| Solver | Regret-3 construction, then ALNS: random, worst, related (Shaw) and route removal; greedy, regret-2 and regret-3 repair; simulated-annealing acceptance; adaptive operator weights. Skills are hard, lateness is soft with a large weight, overtime is capped at an hour. Objective order: missed jobs, priority-weighted lateness, driving, overtime | `src/core/solver.ts`, `model.ts` |
| Re-planning | Events: a technician goes home, an urgent job, an overrun, a traffic change. Each freezes what is done or under way, repairs the rest from the current plan, then searches until 500 iterations or 50 ms. Moving a job to another technician costs as much as five minutes of driving, so a re-plan does not reshuffle the day to save one. The log records which jobs changed technician | `src/core/sim.ts`, `scenario.ts` |
| Baselines | A greedy dispatcher (nearest free qualified technician, urgent jobs first) and the morning plan kept as it was, with an absent technician's jobs and new urgent jobs pushed to whoever finishes first. Same events, same scoring | `src/core/greedy.ts`, `metrics.ts` |
| Benchmark | A VRPLIB reader for the Solomon VRPTW instances, solved by the same code with hard windows and capacity | `src/core/solomon.ts` |
| Page | React with `useSyncExternalStore` over a worker RPC. The map is Canvas 2D; the timeline is plain DOM and CSS | `src/worker/`, `src/ui/` |

## Measured, not guessed

`npm run eval` replays seeded synthetic days in Node. Every method gets the same day and the same scripted disruptions, and every re-plan is timed. It also solves each undisrupted day with the construction alone and with the search, and, when `bench/solomon/` holds instances (`npm run solomon` fetches twelve from the PyVRP instance set), measures the gap to their best-known distances. It writes `src/generated/eval.json`, which the page imports, and the tables below:

<!-- eval:start -->
120 synthetic days (8-12 technicians, 62-96 jobs a day, 9,051 jobs in all), each with the same scripted disruptions for every method: one technician sent home at a random time between 09:00 and 11:00, 2-3 urgent jobs called in between 10:00 and 15:30 (each to start within 2 h), one job overrunning by 40-75 min, and a 1.4-1.8x traffic spike starting between 15:00 and 16:00 and lasting 60-90 min.

| Method | Jobs completed | On time | Priority-weighted lateness, min/day | Drive, min/day | Overtime, min/day |
| --- | --- | --- | --- | --- | --- |
| **Dispatch (re-plans every event)** | **98.9%** (8,953/9,051) | **97.0%** | 41.7 | 703 | 228 |
| Dispatch, repair only (no search) | 97.7% (8,844/9,051) | 92.7% | 215.3 | 699 | 230 |
| Morning plan, no re-planning | 94.4% (8,542/9,051) | 90.8% | 672.1 | 653 | 178 |
| Greedy nearest free technician | 93.0% (8,419/9,051) | 65.4% | 3168.4 | 1,377 | 289 |

| Measure | Result |
| --- | --- |
| Re-plan latency, p50 / p95 / max (Node v22.22.0) | 17.6 / 50.0 / 50.5 ms over 781 re-plans; 158 stopped at the 50 ms deadline |
| Re-plan after a sick call, p50 / p95 | 50.0 / 50.1 ms; median 12 jobs changed technician |
| Repair alone (before the search), p50 / p95 / max | 0.05 / 0.22 / 1.09 ms |
| Days where Dispatch had more visits on time than the morning plan / than greedy | 111 / 120 of 120 (ties 6 / 0) |
| Urgent jobs started within 2 h: Dispatch / morning plan / greedy | 297 / 68 / 300 of 302 |
| Undisrupted days, ALNS vs regret-3 construction alone: drive min/day | 535 vs 700 (23.5% less); on time 100.0% vs 99.5%; overtime 2 vs 60 min/day |
| Morning plan (2500 ALNS iterations), median / max time | 515 / 765 ms |
| Solomon VRPTW, gap to best-known distance (12 instances, 5000 iterations each) | mean 2.29%, max 9.24%; 4 matched the best-known cost; all on time and within capacity |

| Solomon instance | Distance | Best known | Gap | Vehicles (best known) |
| --- | --- | --- | --- | --- |
| C101 | 827.3 | 827.3 | 0.00% | 10 (10) |
| C102 | 827.3 | 827.3 | 0.00% | 10 (10) |
| C201 | 589.1 | 589.1 | 0.00% | 3 (3) |
| C202 | 589.1 | 589.1 | 0.00% | 3 (3) |
| R101 | 1651.9 | 1637.7 | 0.87% | 19 (20) |
| R102 | 1472.6 | 1466.6 | 0.41% | 18 (18) |
| R201 | 1191.1 | 1143.2 | 4.19% | 6 (8) |
| R202 | 1078.3 | 1029.6 | 4.73% | 6 (8) |
| RC101 | 1655.1 | 1619.8 | 2.18% | 16 (15) |
| RC102 | 1475.4 | 1457.4 | 1.23% | 14 (14) |
| RC201 | 1320.4 | 1261.8 | 4.64% | 8 (9) |
| RC202 | 1193.2 | 1092.3 | 9.24% | 6 (8) |
<!-- eval:end -->

Re-plan latency depends on the machine. Re-plans after a sick call usually use the whole 50 ms; on a slower machine they get fewer iterations. The plan is still complete, because repair runs before the search, but it can be worse.

`npm test` (node:test, run with tsx) covers:
- RNG determinism
- shortest paths against Floyd-Warshall, and a city that crosses the river only on bridges
- the traffic model: FIFO, and arrival and latest departure as inverses
- route timing against a brute-force simulation, and the O(1) slack verdict against brute-force re-simulation of more than a thousand random insertions under rush hour
- insertion cost: exact for lateness under rush hour, exact in full under flat traffic, and the best insertion found
- the solver: regret insertion places every job on an easy instance, ALNS never ends worse than it started and its cost matches a brute-force walk, and the same seed gives the same plan
- the stability cost: a job planned on another technician costs exactly that much more, in the route and in every insertion
- re-planning: frozen visits never move, a technician who went home gets nothing, urgent jobs are served, a visit under way stays with its technician
- an end-to-end small day, and both baselines
- the C101 best-known routes costing 827.3 under the DIMACS convention

## Limits

- The data is synthetic. A real city has one-way streets, parking and roadworks, and real job durations scatter more than these do.
- Travel and job times are treated as known once an event says so. A real dispatcher would plan with buffers for the next surprise; this one only reacts.
- Under rush hour, the O(1) check is exact for lateness and the overtime cap, while the change in driving and overtime it reports is an estimate. Accepted plans are re-timed exactly, so the reported figures are exact.
- The generator never makes a day smaller than 60 jobs, so with eight technicians the smallest teams are the busiest.
- Breaks, parts, van stock and jobs that span days are not modelled.

## Rebuild

```bash
cd dispatch-src
npm install
npm run solomon # optional: fetch the Solomon instances into bench/solomon
npm run all     # data -> eval -> test -> build into ../dispatch
```

Once `npm run data` has run, `npm run dev` serves the app locally on port 8775. `npm run eval -- --days 20` is a quicker evaluation.
