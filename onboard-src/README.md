# Onboard

Customer data onboarding in the browser. Three messy exports of the same customers go in (a CRM, a billing system and a help desk), and one customer table comes out, with every value traced back to the file, row and column it came from. Live at **[invokfung.github.io/onboard](https://invokfung.github.io/onboard/)**.

The demo data is synthetic: 4,000 fictional customers spread over 10,200 records, generated in the browser from the seed `week-one`. The page checks the regenerated files against SHA-256 hashes recorded at build time. You can also drop your own CSV or JSON files on the page. They are read with the File API and processed in a Web Worker in that tab, and nothing is uploaded.

## How it works

Every stage is a typed module in `src/core/`. The Web Worker, the evaluation script and the tests all use the same modules, so the page runs the code that was measured. No runtime dependency does the work: React renders the page, and the algorithms below were written for this project.

| Step | What | Where |
| --- | --- | --- |
| Data | Seeded generator (cyrb128 + sfc32). It writes a semicolon CSV with a BOM and CRLF from the CRM, NDJSON with nested objects from billing, and a comma CSV with other column names from the help desk. It adds typos, nicknames, swapped names, households, changed emails, mixed date and phone formats, three currencies, test rows, and PII in free-text notes. Truth is written to a separate file the pipeline never reads | `src/gen/` |
| Ingest | CSV parser that scans char codes and sniffs the delimiter, handling quoted line breaks, a BOM and CRLF. NDJSON and JSON are flattened to dotted paths. Row and line numbers are kept for lineage | `src/core/csv.ts`, `json.ts`, `ingest.ts` |
| Profile | Per column: inferred type, fill rate, null tokens, format masks, top values, and an exact distinct count next to a HyperLogLog estimate (p = 12, MurmurHash3) | `src/core/profile.ts`, `hll.ts` |
| PII | Emails, phones, cards, IBANs and birth dates, in columns and inside notes. Candidates are validated: Luhn plus network prefix for cards, mod-97 plus country length for IBANs, phone plausibility and context, a keyword for birth dates. Each type gets a policy: mask, keep, or a keyed token (HMAC-SHA256 via WebCrypto) | `src/core/pii.ts`, `checks.ts` |
| Map | Each column is scored against 17 canonical fields by header words and by values. The assignment is one-to-one via the Hungarian algorithm, with an explicit unmapped option. The mapping exports as YAML and SQL views | `src/core/mapping.ts`, `schema.ts` |
| Normalize | Phones to E.164, dates to ISO 8601 (day-first or month-first decided per column, with ambiguous dates flagged), money to EUR at fixed demo rates, plus email, name, company and street folding | `src/core/normalize.ts`, `records.ts` |
| Contracts | 12 declarative rules (not null, regex, range, allowed values, uniqueness, cross-source agreement). Records that identify nobody, and test rows, are quarantined | `src/core/contracts.ts` |
| Resolve | Seven blocking keys, seven field comparators (Jaro-Winkler, Soundex, nicknames). Fellegi-Sunter weights with m learned by EM and u from random pairs, plus term-frequency adjustment. Two guard rules become cannot-link constraints in union-find. Two thresholds separate automatic merges from a review queue | `src/core/blocking.ts`, `compare.ts`, `fs.ts`, `er.ts`, `unionfind.ts` |
| Golden | One row per customer. Survivorship rules per field group (most frequent, most recent, most complete, source priority, earliest), and every value carries its lineage | `src/core/golden.ts` |
| SQL | A small SQL engine (tokenizer, recursive-descent parser, executor with GROUP BY, HAVING, ORDER BY, CASE, LIKE, IN and aggregates) over the golden table, the records and the scored pairs | `src/sql/` |
| Page | React with `useSyncExternalStore` over a worker RPC. The pipeline board, match graph, histogram and charts are plain SVG and CSS | `src/worker/`, `src/ui/` |

Changing a decision on the page (a mapping override, a review answer, a threshold, a survivorship rule or a PII policy) re-runs only the stages after it, inside the worker.

## Measured, not guessed

`npm run eval` regenerates the data, runs the pipeline in Node, and scores each stage against the generator's truth. It then repeats the run on four more seeds and compares against a naive baseline. It writes `src/generated/eval.json`, which the page imports, and the table below:

<!-- eval:start -->
| Measure | Result |
| --- | --- |
| Entity resolution, pairwise F1 (precision / recall) | **0.977** (97.4% / 98.0%) |
| Entity resolution, B-cubed F1 (precision / recall) | **0.989** (99.2% / 98.7%) |
| Naive baseline (exact email as exported), pairwise F1 | 0.659 |
| Same, after resolving the 506 review-queue pairs correctly | pairwise F1 0.989 |
| Pairwise F1 across 5 seeds (mean, min–max) | 0.976 (0.972–0.978) |
| Blocking: reduction ratio / pairs completeness | 99.96% / 99.1% |
| Schema mapping accuracy | 100.0% (48 of 48 columns) |
| PII detection, precision / recall | 100.0% / 100.0% (regex only: 71.1% / 96.9%) |
| HyperLogLog distinct-count error, mean / max over 48 columns | 0.9% / 2.9% |
| Throughput (Node v22.22.0, median of 5) | 6,439 records/s (1,584 ms for 10,200) |
<!-- eval:end -->

The page shows its own stage timings next to the Node figures, and recomputes pairwise F1 live as you move the threshold or answer review pairs.

The PII checks were tuned while looking at what this generator produces. Expect lower figures on real notes, which carry patterns the generator does not.

`npm test` (node:test, run with tsx) covers:
- CSV edge cases and a round-trip fuzz
- Luhn and IBAN validation
- HyperLogLog error bounds and MurmurHash3 reference vectors
- Jaro-Winkler reference values
- EM convergence on a planted model
- union-find with cannot-link constraints
- survivorship and lineage
- the SQL engine
- an end-to-end run of the pipeline on a small seed

## Rebuild

```bash
cd onboard-src
npm install
npm run all     # data -> eval -> test -> build into ../onboard
```

Once `npm run data` has run, `npm run dev` serves the app locally on port 8774.

## Next steps

- Learn the review queue's answers back into the model: refit m with the labelled pairs instead of only re-clustering.
- Stream large files through the parser in chunks, so profiling and PII scanning start before the whole file is read.
- Export the mapping and survivorship rules as a dbt model, so the same onboarding can run as a batch job next to the warehouse.
