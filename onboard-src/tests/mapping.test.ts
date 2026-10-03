import { test } from "node:test";
import assert from "node:assert/strict";
import { autoMap, headerTokens, nameScore, toSql, toYaml } from "../src/core/mapping";
import { profileTable } from "../src/core/profile";
import { ingest } from "../src/core/ingest";
import { toCsv } from "../src/core/csv";
import { Rng } from "../src/core/rng";

test("header words: camelCase, punctuation and # split into tokens", () => {
  assert.deepEqual(headerTokens("custEmailAddress"), ["email", "address"]);
  assert.deepEqual(headerTokens("Customer #"), ["number"]);
  assert.deepEqual(headerTokens("holder.name.given"), ["holder", "name", "given"]);
  assert.ok(nameScore("E-mail", "email") > 0.9);
  assert.ok(nameScore("Surname", "last_name") > 0.9);
  assert.ok(nameScore("Surname", "email") < 0.2);
});

/** A small export whose headers say little: the values have to carry the mapping. */
function sample(): string {
  const rng = new Rng("mapping-test");
  const first = ["Ana", "Bo", "Cara", "Dev", "Eva", "Finn", "Gus", "Hana", "Ivo", "Jun"];
  const last = ["Ruiz", "Lind", "Okafor", "Patel", "Berg", "Moss", "Hale", "Sato", "Kral", "Dunn"];
  const countries = ["United Kingdom", "Germany", "France", "Spain", "UK", "Deutschland"];
  const rows = [["Ref", "Given", "Family", "Contact", "col_5", "Region", "Opened", "Comment"]];
  for (let i = 0; i < 120; i++) {
    const f = rng.pick(first);
    const l = rng.pick(last);
    rows.push([
      `R-${10000 + i}`,
      f,
      l,
      `${f.toLowerCase()}.${l.toLowerCase()}${i}@mail.example`,
      `+44 20 7946 ${String(1000 + i)}`,
      rng.pick(countries),
      `${rng.range(1, 28)}/${rng.range(1, 12)}/20${rng.range(10, 23)}`,
      rng.chance(0.5) ? "Called about the invoice and asked for a copy by post" : "",
    ]);
  }
  return toCsv(rows);
}

test("autoMap: values decide when headers are vague, and every column maps once at most", () => {
  const t = ingest({ id: "x", label: "x", name: "x.csv", text: sample() });
  const m = autoMap(t, profileTable(t));
  const got = Object.fromEntries(m.map((c) => [c.column, c.field]));
  assert.deepEqual(got, {
    Ref: "source_id",
    Given: "first_name",
    Family: "last_name",
    Contact: "email",
    col_5: "phone",
    Region: "country",
    Opened: "created_at",
    Comment: "notes",
  });
  const fields = m.map((c) => c.field).filter(Boolean);
  assert.equal(new Set(fields).size, fields.length);
  for (const c of m) assert.ok(c.confidence > 0 && c.confidence <= 1);
});

test("exports: YAML and one CREATE VIEW per source", () => {
  const t = ingest({ id: "crm", label: "CRM", name: "crm export.csv", text: sample() });
  const m = autoMap(t, profileTable(t));
  const yaml = toYaml([{ id: "crm", name: t.name, mapping: m }], "2026-01-01");
  assert.match(yaml, /^ {6}Contact: \{ field: email, confidence: 0\.\d\d \}$/m);
  const sql = toSql([{ id: "crm", name: t.name, mapping: m }], "2026-01-01");
  assert.match(sql, /CREATE VIEW stg_crm AS/);
  assert.match(sql, /"Contact" AS email/);
  assert.match(sql, /CAST\(NULL AS [A-Z]+[^)]*\) AS company/);
  assert.match(sql, /FROM raw\.crm_export_csv;/);
});
