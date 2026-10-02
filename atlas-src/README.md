# StudyLog Atlas

Every post in the [StudyLog](https://invokfung.github.io/blog/) as an explorable 3D galaxy, with search that cites the exact section. Live at **[invokfung.github.io/atlas](https://invokfung.github.io/atlas/)**.

Each star is a passage (a post split at its headings). Stars are placed by meaning, so related ideas sit together even across courses: a MongoDB passage on the outbox pattern lands next to the Dev Essentials passage on at-least-once delivery.

## How it works

Everything is computed at build time in TypeScript, with no external model, API key or server. Search runs in the browser against a 2.6 MB binary index.

| Step | What | Where |
| --- | --- | --- |
| Passages | Parse the rendered blog, split at `h1`–`h3`, window long sections, flatten KaTeX, tables and code to readable text | `scripts/build-data.ts` |
| Keyword | BM25 inverted index, packed into typed arrays (`Uint32` offsets, `Uint16` doc ids, `Uint8` term frequencies) | `scripts/build-data.ts`, `src/search/engine.ts` |
| Meaning | TF-IDF matrix → randomized truncated SVD (Halko, Martinsson & Tropp) to 96 dimensions, i.e. latent semantic analysis. Queries are folded in through V | `scripts/linalg.ts` |
| Fusion | Hybrid mode merges the two rankings with reciprocal rank fusion (k = 60) | `src/search/engine.ts` |
| Map | UMAP projects the 96-d passage vectors to 3D | `scripts/build-data.ts` |
| Scene | React Three Fiber; one `THREE.Points` draw call with a custom GLSL shader for glow, twinkle and highlight easing | `src/Galaxy.tsx` |

The tokenizer in `src/search/text.ts` is shared by the build and the browser, so a query is split exactly the way the index was.

## Measured, not guessed

`eval/questions.json` holds 60 questions written the way a reader would ask them, each naming the post that answers it. `npm run eval` scores every mode at the post level:

| Mode | Hit@1 | Hit@5 | MRR@10 |
| --- | --- | --- | --- |
| **Hybrid** | **85.0%** | **98.3%** | **0.906** |
| Keyword (BM25) | 81.7% | 98.3% | 0.879 |
| Meaning (LSA) | 80.0% | 96.7% | 0.878 |

The same table, with the rank of the right post for every question, is in the app under "How it works".

## Rebuild after new posts

```bash
cd atlas-src
npm install
npm run all     # data -> eval -> build into ../atlas
```

`npm run dev` serves the app locally once `npm run data` has run.

## Next steps

- Swap LSA for neural sentence embeddings, computed in CI (the build container that made this version had no access to a model hub), and compare against the same eval set.
- Generated answers with citations from a hosted model, behind a small API, keeping retrieval as it is.
