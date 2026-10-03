import { test } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../src/gen/generate";
import { Session, STAGES, type StageEvent } from "../src/core/pipeline";
import { entityLabels, mappingScore, oracleDecisions, piiScore, scoreLabels, emailBaseline } from "../src/core/score";
import { ibanValid, luhn } from "../src/core/checks";

const g = generate("unit-tests", 600);

test("generator: the same seed gives byte-identical files, another seed different ones", () => {
  const again = generate("unit-tests", 600);
  assert.deepEqual(
    again.files.map((f) => f.text),
    g.files.map((f) => f.text),
  );
  assert.notEqual(generate("other-seed", 600).files[0].text, g.files[0].text);
  assert.equal(g.files.length, 3);
  assert.ok(g.files[0].text.startsWith("﻿"), "the CRM export carries a byte-order mark");
});

test("generator: injected PII is real where it should be (valid cards and IBANs) and truth is kept apart", () => {
  const cards = g.truth.pii.filter((p) => p.type === "card");
  const ibans = g.truth.pii.filter((p) => p.type === "iban");
  assert.ok(cards.length > 5 && ibans.length > 5);
  for (const c of cards) assert.equal(luhn(c.value.replace(/\D/g, "")), true, c.value);
  for (const i of ibans) assert.equal(ibanValid(i.value), true, i.value);
  const ids = new Set(Object.values(g.truth.entities).flat());
  for (const f of g.files) for (const m of f.text.matchAll(/\bE\d{5}\b/g)) assert.ok(!ids.has(m[0]), `truth id ${m[0]} leaked into ${f.name}`);
});

test("pipeline: every stage runs and reports, and the result is scored against truth", async () => {
  const events: StageEvent[] = [];
  const s = await Session.run(g.files, {}, (e) => events.push(e));
  assert.deepEqual(
    events.map((e) => e.stage),
    STAGES.map((x) => x.key),
  );
  const labels = entityLabels(s, g.truth);
  const er = scoreLabels(s.clustering.labels, labels);
  const base = scoreLabels(emailBaseline(s, "raw"), labels);
  assert.ok(er.pairwise.f1 > 0.93, `pairwise F1 ${er.pairwise.f1}`);
  assert.ok(er.pairwise.f1 > base.pairwise.f1 + 0.15, "clearly better than matching on email");
  assert.ok(mappingScore(s, g.truth).accuracy >= 0.95);
  const pii = piiScore(s, g.truth);
  assert.ok(pii.overall.precision > 0.95 && pii.overall.recall > 0.9);
  // the test rows the generator planted end up in quarantine
  const junk = s.recs.filter((r) => (g.truth.entities[r.source]?.[r.row] ?? "").startsWith("junk"));
  assert.ok(junk.length > 0);
  for (const r of junk) assert.ok(s.quarantine.has(r.i), `junk row ${r.source}:${r.row} not quarantined`);
  // every record is in exactly one golden record, except quarantined ones
  const seen = new Set<number>();
  for (const gr of s.golden) for (const i of gr.members) assert.ok(!seen.has(i)), seen.add(i);
  assert.equal(seen.size + s.quarantine.size, s.recs.length);
});

test("pipeline: review decisions and a threshold change re-cluster without re-running the rest", async () => {
  const s = await Session.run(g.files);
  const labels = entityLabels(s, g.truth);
  const before = scoreLabels(s.clustering.labels, labels).pairwise.f1;
  const pairsBefore = s.er.pairs.prob.length;
  for (const [p, same] of oracleDecisions(s, labels)) s.decide(p, same);
  const after = scoreLabels(s.clustering.labels, labels).pairwise.f1;
  assert.ok(after >= before, `${after} < ${before}`);
  assert.equal(s.clustering.review.length, 0);
  assert.equal(s.er.pairs.prob.length, pairsBefore, "candidate pairs were not recomputed");
  const merged = s.golden.length;
  s.setThresholds({ match: 0.999, review: 0.6 });
  assert.ok(s.golden.length >= merged);
});

test("pipeline: a mapping override flows through to the records", async () => {
  const s = await Session.run(g.files);
  const crm = s.mappings.get("crm")!;
  const emailCol = crm.find((m) => m.field === "email")!.column;
  s.setMapping("crm", emailCol, null);
  assert.ok(s.recs.filter((r) => r.source === "crm").every((r) => r.email === ""));
  s.setMapping("crm", emailCol, "email");
  assert.ok(s.recs.filter((r) => r.source === "crm").some((r) => r.email !== ""));
});

test("pipeline: a PII policy change re-redacts with HMAC tokens under the new key", async () => {
  const s = await Session.run(g.files);
  const sample = () => [...s.redacted.values()].flat().find((x) => x.type === "email")?.text ?? "";
  const t1 = sample();
  assert.match(t1, /^email_[0-9a-f]{12}$/);
  await s.applyPolicy(s.policy, "another-key");
  assert.notEqual(sample(), t1);
  await s.applyPolicy({ ...s.policy, email: "keep" });
  assert.match(sample(), /@/);
});
