import { test } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../src/gen/generate";
import { Session } from "../src/core/pipeline";
import * as V from "../src/worker/views";
import { parseCsv } from "../src/core/csv";

async function demo(): Promise<V.Ctx> {
  const g = generate("views-test", 500);
  const stages = new Map();
  const s = await Session.run(g.files, {}, (e) => stages.set(e.stage, e));
  return { s, mode: "demo", seed: g.seed, customers: 500, truth: g.truth, generateMs: 0, verified: null, stages, cache: {} };
}

test("views: every snapshot the page asks for is JSON-safe and consistent", async () => {
  const ctx = await demo();
  const o = V.overview(ctx);
  assert.equal(o.totals.records, ctx.s.recs.length);
  assert.equal(o.stages.length, 8);
  assert.ok(o.score && o.score.pairwise.f1 > 0.9);

  const feat = V.featured(ctx);
  assert.ok(feat.length >= 3, `featured ${feat.length}`);
  for (const f of feat) assert.ok(f.records >= 3 && f.sources.length === 3 && f.why.length > 0);

  const c = V.cluster(ctx, { golden: feat[0].golden });
  const ids = new Set(c.records.map((r) => r.i));
  for (const e of c.edges) assert.ok(ids.has(e.a) && ids.has(e.b));
  for (const m of c.golden.members) assert.ok(ids.has(m));
  // lineage points at cells the record view shows
  for (const f of c.golden.fields)
    for (const l of f.lineage) {
      const r = c.records.find((x) => x.i === l.rec)!;
      assert.equal(r.cells.find((x) => x.column === l.column)!.raw, l.raw);
    }

  for (const view of [V.profile(ctx), V.pii(ctx), V.mapping(ctx), V.review(ctx, 0, 5), V.model(ctx), V.contracts(ctx), V.goldenTable(ctx, 0, 10, ""), V.beforeAfter(ctx, feat.map((f) => f.anchor)), V.sqlSchema(ctx)])
    assert.doesNotThrow(() => JSON.stringify(view));

  const h = V.model(ctx).histogram;
  assert.equal(
    h.bins.reduce((a, b) => a + b, 0),
    ctx.s.er.pairs.prob.length,
  );
});

test("views: golden CSV export applies the PII policy", async () => {
  const ctx = await demo();
  const out = await V.exportText(ctx, "golden-csv");
  const rows = parseCsv(out.text).rows;
  const email = rows[0].indexOf("email");
  const phone = rows[0].indexOf("phone");
  const withEmail = rows.slice(1).filter((r) => r[email]);
  assert.ok(withEmail.length > 100);
  assert.ok(withEmail.every((r) => /^email_[0-9a-f]{12}$/.test(r[email])), "emails are tokens");
  assert.ok(rows.slice(1).filter((r) => r[phone]).every((r) => r[phone].includes("•")), "phones are masked");
  await ctx.s.applyPolicy({ ...ctx.s.policy, email: "keep" });
  const kept = parseCsv((await V.exportText(ctx, "golden-csv")).text).rows;
  assert.ok(kept.slice(1).some((r) => r[email].includes("@")));
});

test("views: SQL over the session's tables", async () => {
  const ctx = await demo();
  const r = V.sql(ctx, "SELECT source, COUNT(*) AS n FROM records GROUP BY source ORDER BY source");
  assert.deepEqual(r.columns, ["source", "n"]);
  assert.equal(
    r.rows.reduce((a, x) => a + (x[1] as number), 0),
    ctx.s.recs.length,
  );
  const g = V.sql(ctx, "SELECT COUNT(*) FROM customers");
  assert.equal(g.rows[0][0], ctx.s.golden.length);
  const st = V.sql(ctx, "SELECT status, COUNT(*) FROM pairs GROUP BY status");
  assert.ok(st.rows.length >= 2);
});

test("views: a review decision changes the overview and the live score", async () => {
  const ctx = await demo();
  const before = V.review(ctx, 0, 1);
  assert.ok(before.items.length === 1);
  const item = before.items[0];
  ctx.s.decide(item.edge.pair, item.truth!);
  V.invalidate(ctx, "clusters");
  const after = V.review(ctx, 0, 1);
  assert.equal(after.decided, 1);
  assert.equal(after.pending, before.pending - 1);
  assert.ok(after.score!.pairwise.f1 >= before.score!.pairwise.f1 - 1e-9);
});
