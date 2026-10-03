// Worker-thread entry for scripts/eval.ts: load the TypeScript module through
// tsx's API, since loader flags are not reliably applied inside workers.
import { tsImport } from "tsx/esm/api";

await tsImport("./eval.ts", import.meta.url);
