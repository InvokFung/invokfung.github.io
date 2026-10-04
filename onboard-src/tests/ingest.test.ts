import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, sniffDelimiter, toCsv } from "../src/core/csv";
import { flatten, parseJsonRecords, recordsToTable } from "../src/core/json";
import { detectFormat, ingest } from "../src/core/ingest";
import { Rng } from "../src/core/rng";

test("csv: quoted delimiters, doubled quotes and line breaks inside quotes", () => {
  const r = parseCsv('id,name,notes\r\n1,"Smith, Jane","said ""hi""\r\nthen left"\r\n2,Bo,\r\n');
  assert.deepEqual(r.rows, [
    ["id", "name", "notes"],
    ["1", "Smith, Jane", 'said "hi"\r\nthen left'],
    ["2", "Bo", ""],
  ]);
  assert.equal(r.delimiter, ",");
  assert.equal(r.lineEnding, "CRLF");
  assert.equal(r.quoted, 2);
  assert.equal(r.multiline, 1);
  assert.deepEqual(r.errors, []);
});

test("csv: byte-order mark, semicolons and a trailing delimiter at end of file", () => {
  const r = parseCsv("﻿a;b;c\n1;2;");
  assert.equal(r.bom, true);
  assert.equal(r.delimiter, ";");
  assert.deepEqual(r.rows, [
    ["a", "b", "c"],
    ["1", "2", ""],
  ]);
});

test("csv: blank lines are skipped and counted; CR-only line endings", () => {
  const r = parseCsv("a,b\r\r1,2\r\r\r3,4");
  assert.deepEqual(r.rows, [
    ["a", "b"],
    ["1", "2"],
    ["3", "4"],
  ]);
  assert.equal(r.blank, 3);
  assert.equal(r.lineEnding, "CR");
});

test("csv: an unterminated quote is reported, not swallowed silently", () => {
  const r = parseCsv('a,b\n1,"open\n2,3');
  assert.ok(r.errors.length >= 1);
});

test("csv: delimiter sniffing ignores delimiters inside quotes", () => {
  assert.equal(sniffDelimiter('name;city\n"Lee, Ann";Leeds\n"Ng, Bo";York\n'), ";");
  assert.equal(sniffDelimiter("a\tb\tc\n1\t2\t3\n"), "\t");
  assert.equal(sniffDelimiter("a|b\n1|2\n3|4\n"), "|");
  assert.equal(sniffDelimiter("a,b,c\n1,2,3\n"), ",");
});

test("csv: toCsv then parseCsv round-trips 300 random tables", () => {
  const rng = new Rng("csv-fuzz");
  const alphabet = ["a", "b", " ", ",", ";", '"', "\n", "\r\n", "é", "1", "\t"];
  for (let t = 0; t < 300; t++) {
    const cols = rng.range(1, 5);
    const rows: string[][] = [];
    for (let r = 0, n = rng.range(1, 6); r < n; r++) {
      const row: string[] = [];
      for (let c = 0; c < cols; c++) {
        let s = "";
        for (let k = rng.range(0, 6); k > 0; k--) s += rng.pick(alphabet);
        row.push(s);
      }
      // a row of one empty field is a blank line in CSV; give it content
      if (cols === 1 && !row[0]) row[0] = "x";
      rows.push(row);
    }
    const delimiter = rng.pick([",", ";", "\t"]);
    const eol = rng.pick(["\n", "\r\n"]);
    const text = toCsv(rows, { delimiter, eol, bom: rng.chance(0.5) });
    const back = parseCsv(text, { delimiter });
    assert.deepEqual(back.rows, rows, `case ${t}: ${JSON.stringify(text)}`);
  }
});

test("json: nested objects flatten to dotted paths; arrays join or index", () => {
  const flat = flatten({ id: 7, holder: { name: { given: "Ana", family: "Ruiz" } }, tags: ["a", "b"], invoices: [{ amount: 1 }, { amount: 2 }], none: null });
  assert.deepEqual(flat, {
    id: "7",
    "holder.name.given": "Ana",
    "holder.name.family": "Ruiz",
    tags: "a; b",
    "invoices[0].amount": "1",
    "invoices[1].amount": "2",
    none: "",
  });
});

test("json: NDJSON, a JSON array, and an object wrapping one array", () => {
  const nd = parseJsonRecords('{"a":1}\n\n{"a":2,"b":{"c":3}}\n');
  assert.equal(nd.format, "ndjson");
  assert.equal(nd.records.length, 2);
  assert.deepEqual(nd.lines, [1, 3]);
  const arr = parseJsonRecords('[{"a":1},{"a":2}]');
  assert.equal(arr.format, "json");
  assert.equal(arr.records.length, 2);
  const wrapped = parseJsonRecords('{"data":[{"a":1},{"a":2},{"a":3}],"count":3}');
  assert.equal(wrapped.records.length, 3);
  const t = recordsToTable(nd.records);
  assert.deepEqual(t.columns, ["a", "b.c"]);
  assert.deepEqual(t.rows, [
    ["1", ""],
    ["2", "3"],
  ]);
});

test("json: a bad NDJSON line is reported and the rest kept", () => {
  const r = parseJsonRecords('{"a":1}\n{"a":\n{"a":3}\n');
  assert.equal(r.records.length, 2);
  assert.equal(r.errors.length, 1);
});

test("ingest: detects the format and pads ragged rows", () => {
  assert.equal(detectFormat({ name: "x.txt", text: '[{"a":1}]' }), "json");
  assert.equal(detectFormat({ name: "x.csv", text: "a,b\n1,2" }), "csv");
  const t = ingest({ id: "up", label: "Upload", name: "x.csv", text: "a,b,c\n1,2\n3,4,5,6\n" });
  assert.deepEqual(t.columns, ["a", "b", "c"]);
  assert.deepEqual(t.rows, [
    ["1", "2", ""],
    ["3", "4", "5"],
  ]);
  assert.equal(t.meta.ragged, 2);
});
