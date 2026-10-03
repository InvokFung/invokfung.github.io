import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, SqlError } from "../src/sql/parse";
import { runSql, type SqlTable } from "../src/sql/run";

const people: SqlTable = {
  name: "customers",
  columns: ["id", "name", "country", "balance", "email"],
  rows: [
    { id: 1, name: "Ana Ruiz", country: "ES", balance: 120.5, email: "ana@mail.example" },
    { id: 2, name: "Bo Lind", country: "SE", balance: 80, email: null },
    { id: 3, name: "Cara O'Neill", country: "IE", balance: null, email: "cara@mail.example" },
    { id: 4, name: "Dev Patel", country: "GB", balance: 300, email: "dev@work.example" },
    { id: 5, name: "Eva Berg", country: "SE", balance: 15, email: "eva@mail.example" },
    { id: 6, name: "Finn Moss", country: "GB", balance: 300, email: null },
  ],
};
const tables = new Map([["customers", people]]);
const q = (sql: string) => runSql(sql, tables);

test("sql: projection, WHERE with three-valued logic, ORDER BY, LIMIT/OFFSET", () => {
  assert.deepEqual(q("SELECT id FROM customers WHERE balance > 100 ORDER BY id").rows, [[1], [4], [6]]);
  // NULL balance is neither > 100 nor <= 100
  assert.equal(q("SELECT id FROM customers WHERE balance <= 100").rows.length, 2);
  assert.deepEqual(q("SELECT id FROM customers WHERE email IS NULL ORDER BY id DESC").rows, [[6], [2]]);
  assert.deepEqual(q("SELECT name FROM customers ORDER BY balance DESC, name LIMIT 2 OFFSET 1").rows, [["Finn Moss"], ["Ana Ruiz"]]);
  assert.deepEqual(q("SELECT id FROM customers WHERE NOT (country = 'SE' OR country = 'GB') ORDER BY 1").rows, [[1], [3]]);
  const all = q("SELECT * FROM customers");
  assert.deepEqual(all.columns, people.columns);
  assert.equal(all.rows.length, 6);
});

test("sql: LIKE, IN, BETWEEN, CASE, string and scalar functions", () => {
  assert.deepEqual(q("SELECT id FROM customers WHERE email LIKE '%@MAIL.example' ORDER BY id").rows, [[1], [3], [5]]);
  assert.deepEqual(q("SELECT id FROM customers WHERE name LIKE '_o %'").rows, [[2]]);
  assert.deepEqual(q("SELECT id FROM customers WHERE country NOT IN ('SE', 'GB') ORDER BY id").rows, [[1], [3]]);
  assert.deepEqual(q("SELECT id FROM customers WHERE balance BETWEEN 80 AND 121 ORDER BY id").rows, [[1], [2]]);
  assert.deepEqual(q("SELECT UPPER(country) || '-' || id AS tag, COALESCE(email, 'none') e FROM customers WHERE id = 2").rows, [["SE-2", "none"]]);
  assert.deepEqual(q("SELECT CASE WHEN balance >= 300 THEN 'high' WHEN balance >= 100 THEN 'mid' ELSE 'low' END AS band FROM customers ORDER BY id").rows.flat(), ["mid", "low", "low", "high", "low", "high"]);
  assert.deepEqual(q("SELECT ROUND(balance / 3, 2), LENGTH(name), SUBSTR(name, 1, 3) FROM customers WHERE id = 1").rows, [[40.17, 8, "Ana"]]);
  assert.deepEqual(q("SELECT name FROM customers WHERE name = 'Cara O''Neill'").rows, [["Cara O'Neill"]]);
});

test("sql: GROUP BY with aggregates, HAVING on an alias, ORDER BY an aggregate", () => {
  const r = q("SELECT country, COUNT(*) AS n, SUM(balance) total, AVG(balance), MAX(name) FROM customers GROUP BY country HAVING n > 1 ORDER BY total DESC");
  assert.deepEqual(r.columns, ["country", "n", "total", "AVG(balance)", "MAX(name)"]);
  assert.deepEqual(r.rows, [
    ["GB", 2, 600, 300, "Finn Moss"],
    ["SE", 2, 95, 47.5, "Eva Berg"],
  ]);
  assert.deepEqual(q("SELECT COUNT(*), COUNT(email), COUNT(DISTINCT country), MIN(balance) FROM customers").rows, [[6, 4, 4, 15]]);
  assert.deepEqual(q("SELECT COUNT(*) FROM customers WHERE id > 99").rows, [[0]]);
  assert.deepEqual(q("SELECT country, COUNT(*) FROM customers GROUP BY 1 ORDER BY COUNT(*) DESC, country LIMIT 1").rows, [["GB", 2]]);
  assert.deepEqual(q("SELECT DISTINCT country FROM customers ORDER BY country").rows.flat(), ["ES", "GB", "IE", "SE"]);
});

test("sql: errors say what was expected and where", () => {
  assert.throws(() => parse("SELECT FROM customers"), SqlError);
  assert.throws(() => q("SELECT nope FROM customers"), /no column named "nope"/);
  assert.throws(() => q("SELECT id FROM nowhere"), /no table named "nowhere"/);
  assert.throws(() => q("SELECT id FROM customers WHERE COUNT(*) > 1"), /HAVING/);
  assert.throws(() => parse("SELECT id FROM customers WHERE name = 'open"), /unterminated string/);
  try {
    parse("SELECT id FROM customers WHERE");
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof SqlError);
    assert.match(e.message, /query ended/);
  }
});
