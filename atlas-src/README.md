# StudyLog Atlas

A hybrid search engine that runs entirely in the browser, over the 173 posts of my [StudyLog](https://invokfung.github.io/blog/). Live at **[invokfung.github.io/atlas](https://invokfung.github.io/atlas/)**.

The page shows its own work: as you type, each stage of the query (tokenizer, BM25, LSA, rank fusion) reports its intermediate output and its time on your device, a chart shows how the two ranked lists fused, and the 60-question benchmark reruns live in your browser.

## How it works

Everything is computed at build time in TypeScript, with no external model, API key or server. The browser loads a 2.5 MB binary index and answers a query in well under a millisecond on a laptop.

| Step | What | Where |
| --- | --- | --- |
| Passages | Parse the rendered blog, split at `h1`–`h3`, window long sections (1,400 chars, 250 overlap), flatten KaTeX, tables and code to readable text. Each passage is indexed with its post title and heading path | `scripts/build-data.ts` |
| Keyword | BM25 inverted index, packed into typed arrays (`Uint32` offsets, `Uint16` passage ids, `Uint8` term frequencies) | `scripts/build-data.ts`, `src/search/engine.ts` |
| Meaning | TF-IDF matrix → randomized truncated SVD (Halko, Martinsson & Tropp) to 96 dimensions, i.e. latent semantic analysis, with my own Gram-Schmidt and Jacobi eigensolver. Queries are folded in through V | `scripts/linalg.ts` |
| Scan | Passage vectors are int8; the query is quantized to int16 and scored against all 5,551 passages by a WebAssembly SIMD kernel (`i32x4.dot_i16x8_s`), with an exact JavaScript fallback | `kernel/dot.c`, `src/search/kernel.ts` |
| Top-k | A bounded min-heap instead of sorting every match | `src/search/engine.ts` |
| Fusion | Reciprocal rank fusion (k = 60) merges the two rankings | `src/search/engine.ts` |
| Page | React; the pipeline, rank-flow chart and benchmark are plain SVG and CSS, no chart library | `src/ui/` |

The tokenizer in `src/search/text.ts` is shared by the build and the browser, so a query is split exactly the way the index was.

## Measured, not guessed

`eval/questions.json` holds 60 questions written the way a reader would ask them, each naming the post that answers it. `npm run eval` scores every mode at the post level:

| Mode | Hit@1 | Hit@5 | MRR@10 |
| --- | --- | --- | --- |
| **Hybrid** | **85.0%** | **98.3%** | **0.906** |
| Keyword (BM25) | 81.7% | 98.3% | 0.879 |
| Meaning (LSA) | 80.0% | 96.7% | 0.878 |

The page reruns the same 180 searches in the browser and checks the result against this report.

`npm test` checks that the heap-based top-k matches a full sort on 500 random cases, that the WebAssembly kernel and the JavaScript loop give bit-identical scores on 118 queries, and times both (about 6× faster with SIMD in Node).

## Rebuild after new posts

```bash
cd atlas-src
npm install
npm run all     # data -> eval -> test -> build into ../atlas
```

`npm run dev` serves the app locally once `npm run data` has run. The compiled kernel is checked in as `src/search/kernel-wasm.ts`; `npm run kernel` rebuilds it from `kernel/dot.c` and needs clang with the wasm32 target.

## Next steps

- Compare LSA against neural sentence embeddings computed in CI, on the same eval set.
- Generated answers with citations from a hosted model behind a small API, keeping retrieval as it is.
