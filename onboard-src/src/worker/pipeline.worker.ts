// The pipeline runs here, off the main thread. On start it regenerates the
// synthetic exports from their seed, checks their SHA-256 against the
// manifest `npm run data` wrote, and runs every stage, posting each stage's
// timing as it finishes. Later requests read or change the same session.

import dataset from "../generated/dataset.json";
import { Session } from "../core/pipeline";
import { generate } from "../gen/generate";
import type { SourceFile } from "../core/types";
import type { Request, Response, WorkerEvent } from "./protocol";
import * as V from "./views";

let ctx: V.Ctx | null = null;

const post = (m: Response | WorkerEvent) => (self as unknown as Worker).postMessage(m);

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function start(files: SourceFile[], base: Omit<V.Ctx, "s" | "stages" | "cache">): Promise<void> {
  post({ event: "phase", phase: "running" });
  const stages = new Map();
  const s = await Session.run(files, {}, (e) => {
    stages.set(e.stage, e);
    post({ event: "stage", stage: e.stage, ms: e.ms, stats: e.stats });
  });
  ctx = { ...base, s, stages, cache: {} };
  post({ event: "phase", phase: "ready" });
}

function need(): V.Ctx {
  if (!ctx) throw new Error("the pipeline has not run yet");
  return ctx;
}

async function handle(req: Request): Promise<unknown> {
  switch (req.type) {
    case "demo": {
      post({ event: "phase", phase: "generating" });
      const t0 = performance.now();
      const g = generate(dataset.seed, dataset.customers);
      const generateMs = performance.now() - t0;
      post({ event: "phase", phase: "verifying" });
      const verified = await Promise.all(
        g.files.map(async (f) => {
          const sha = await sha256(f.text);
          const expected = dataset.files.find((x) => x.name === f.name)?.sha256 ?? "";
          return { name: f.name, sha256: sha, expected, ok: sha === expected };
        }),
      );
      await start(g.files, { mode: "demo", seed: g.seed, customers: dataset.customers, truth: g.truth, generateMs, verified });
      return V.overview(need());
    }
    case "files":
      await start(req.files, { mode: "files", seed: null, customers: null, truth: null, generateMs: null, verified: null });
      return V.overview(need());
    case "overview":
      return V.overview(need());
    case "featured":
      return V.featured(need());
    case "cluster":
      return V.cluster(need(), req);
    case "search":
      return V.search(need(), req.query);
    case "beforeAfter":
      return V.beforeAfter(need(), req.records);
    case "profile":
      return V.profile(need());
    case "pii":
      return V.pii(need());
    case "policy":
      await need().s.applyPolicy(req.policy, req.key);
      return V.pii(need());
    case "mapping":
      return V.mapping(need());
    case "setMapping": {
      const c = need();
      c.s.setMapping(req.source, req.column, req.field);
      V.invalidate(c, "records");
      return V.overview(c);
    }
    case "review":
      return V.review(need(), req.offset, req.limit);
    case "decide": {
      const c = need();
      c.s.decide(req.pair, req.same);
      V.invalidate(c, "clusters");
      return V.overview(c);
    }
    case "oracle": {
      // demo only: answer the whole review queue the way the generator's truth would (the eval's "reviewed" row)
      const c = need();
      if (!c.truth) throw new Error("no ground truth for uploaded files");
      V.resolveFromTruth(c);
      V.invalidate(c, "clusters");
      return V.overview(c);
    }
    case "thresholds": {
      const c = need();
      c.s.setThresholds(req.thresholds);
      V.invalidate(c, "clusters");
      return V.overview(c);
    }
    case "model":
      return V.model(need());
    case "contracts":
      return V.contracts(need());
    case "golden":
      return V.goldenTable(need(), req.offset, req.limit, req.query);
    case "survivorship":
      V.setRule(need(), req.field, req.rule);
      return V.overview(need());
    case "export":
      return V.exportText(need(), req.what);
    case "sqlSchema":
      return V.sqlSchema(need());
    case "sql":
      return V.sql(need(), req.query);
  }
}

// one request at a time, so a decision never races a re-cluster
let chain: Promise<void> = Promise.resolve();
self.onmessage = (e: MessageEvent<{ id: number; req: Request }>) => {
  const { id, req } = e.data;
  chain = chain.then(async () => {
    try {
      post({ id, ok: true, data: await handle(req) });
    } catch (err) {
      if (req.type === "demo" || req.type === "files") post({ event: "phase", phase: "error", detail: String((err as Error).message ?? err) });
      post({ id, ok: false, error: String((err as Error).message ?? err) });
    }
  });
};
