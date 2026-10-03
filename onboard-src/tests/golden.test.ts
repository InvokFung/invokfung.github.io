import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGolden, goldenRow, preset, type SurvivorConfig } from "../src/core/golden";
import type { Rec, Table } from "../src/core/types";

// Three records of one customer, one per source, each with the column it came from.
const columns = ["id", "first", "last", "email", "phone", "street", "city", "postcode", "country", "updated", "balance"];
const col = Object.fromEntries(
  (["source_id", "first_name", "last_name", "email", "phone", "street", "city", "postcode", "country", "updated_at", "balance"] as const).map((f, i) => [f, i]),
);

function rec(i: number, source: string, row: number, v: Partial<Rec>): Rec {
  return {
    i, source, row, sourceId: `${source}-${row}`,
    first: "", last: "", email: "", phone: "", company: "", street: "", city: "", postcode: "", country: "",
    dob: "", created: "", updated: "", balance: null, currency: "", balanceBase: null, notes: "",
    col, k: {} as Rec["k"], flags: 0, ...v,
  };
}

const recs: Rec[] = [
  rec(0, "crm", 4, { first: "Katherine", last: "Okafor", email: "kat.okafor@mail.example", phone: "+442079460958", street: "12 Harbour Road", city: "Leeds", postcode: "LS1 4AB", country: "GB", updated: "2023-01-10", balanceBase: 120 }),
  rec(1, "billing", 0, { first: "Kate", last: "Okafor", email: "kat.okafor@mail.example", phone: "+442079460111", street: "3 Mill Lane", city: "York", postcode: "YO1 7HH", country: "GB", updated: "2024-06-01", balanceBase: 450.5 }),
  rec(2, "support", 9, { first: "Katherine", last: "OKAFOR", email: "k.okafor@work.example", phone: "", street: "", city: "Leeds", postcode: "", country: "", updated: "2022-03-02", balanceBase: null }),
];

function table(source: string, rows: number): Table {
  const body = Array.from({ length: rows }, (_, r) => columns.map((c) => `${source}:${r}:${c}`));
  return { source, label: source, name: `${source}.csv`, columns, rows: body, lines: body.map((_, r) => r + 2), meta: { format: "csv", bytes: 0, errors: [] } };
}
const tables = new Map([
  ["crm", table("crm", 10)],
  ["billing", table("billing", 10)],
  ["support", table("support", 10)],
]);
const priority = ["billing", "crm", "support"];

test("survivorship: the recommended rules and their lineage", () => {
  const [g] = buildGolden(recs, [[0, 1, 2]], tables, preset("recommended", priority));
  assert.equal(g.id, "C00001");
  assert.deepEqual(g.sources, ["billing", "crm", "support"]);

  // name: most frequent (two of three say Katherine Okafor, case-insensitively), most recent spelling of it
  assert.equal(g.values.name!.value, "Katherine Okafor");
  assert.equal(g.values.name!.agree, 2);
  assert.deepEqual(g.values.name!.alternatives, ["Kate Okafor"]);
  assert.equal(g.values.name!.lineage[0].source, "crm");

  // email: most frequent
  assert.equal(g.values.email!.value, "kat.okafor@mail.example");
  assert.equal(g.values.email!.candidates, 3);

  // phone: most recent record that has one
  assert.equal(g.values.phone!.value, "+442079460111");

  // address survives as a unit: billing's street never pairs with the CRM's postcode
  assert.equal(g.values.address!.value, "3 Mill Lane, YO1 7HH York, GB");
  assert.deepEqual(new Set(g.values.address!.lineage.map((l) => l.source)), new Set(["billing"]));

  // balance: source priority
  assert.equal(g.values.balance!.value, "€450.50");
  assert.equal(g.values.company, null);
});

test("lineage points at the exact source cell the value came from", () => {
  const [g] = buildGolden(recs, [[0, 1, 2]], tables, preset("recommended", priority));
  for (const v of Object.values(g.values)) {
    if (!v) continue;
    for (const l of v.lineage) {
      const t = tables.get(l.source)!;
      assert.equal(t.columns[col[l.field]], l.column);
      assert.equal(t.rows[l.row][col[l.field]], l.raw);
      assert.equal(l.line, l.row + 2);
      assert.equal(recs[l.rec].source, l.source);
    }
  }
  const phone = g.values.phone!.lineage[0];
  assert.deepEqual([phone.source, phone.row, phone.column, phone.raw], ["billing", 0, "phone", "billing:0:phone"]);
});

test("survivorship: changing a rule changes the winner and its lineage", () => {
  const cfg: SurvivorConfig = preset("recommended", priority);
  const recent = buildGolden(recs, [[0, 1, 2]], tables, { ...cfg, rules: { ...cfg.rules, name: "most_recent" } })[0];
  assert.equal(recent.values.name!.value, "Kate Okafor");
  assert.equal(recent.values.name!.lineage[0].source, "billing");

  const crmFirst = buildGolden(recs, [[0, 1, 2]], tables, { ...preset("source_priority", ["crm", "billing", "support"]) })[0];
  assert.equal(crmFirst.values.phone!.value, "+442079460958");
  assert.equal(crmFirst.values.address!.value, "12 Harbour Road, LS1 4AB Leeds, GB");
  assert.equal(crmFirst.values.balance!.value, "€120.00");

  const complete = buildGolden(recs, [[0, 1, 2]], tables, preset("most_complete", priority))[0];
  assert.notEqual(complete.values.email!.lineage[0].source, "support"); // the support record is the least complete
});

test("golden row flattens a record for export", () => {
  const [g] = buildGolden(recs, [[0, 1, 2]], tables, preset("recommended", priority));
  const row = goldenRow(g, recs);
  assert.equal(row.first_name, "Katherine");
  assert.equal(row.city, "York");
  assert.equal(row.balance_eur, 450.5);
  assert.equal(row.sources, "billing+crm+support");
  assert.equal(row.records, 3);
});

test("survivorship: a newer city-only address does not replace a full one", () => {
  const partial = rec(3, "support", 5, { first: "Katherine", last: "Okafor", city: "Leeds", country: "GB", updated: "2025-01-01" });
  const [g] = buildGolden([...recs, partial], [[0, 1, 2, 3]], tables, preset("recommended", priority));
  assert.equal(g.values.address!.rule, "most_recent");
  assert.equal(g.values.address!.value, "3 Mill Lane, YO1 7HH York, GB");
  assert.equal(g.values.address!.candidates, 4);
  // with no street anywhere, the partial address is still used
  const [h] = buildGolden([recs[2], partial], [[0, 1]], tables, preset("recommended", priority));
  assert.equal(h.values.address!.value, "Leeds, GB");
});
