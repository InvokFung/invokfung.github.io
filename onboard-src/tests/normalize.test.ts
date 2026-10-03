import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalEmail, companyKey, expandStreet, inferDateOrder, isNullish, parseDate, parseMoney, properCase, splitFullName, toBase, toCountry, toE164 } from "../src/core/normalize";
import { classify, formatMask } from "../src/core/profile";

test("phones: national and international spellings agree in E.164", () => {
  const gb = ["020 7946 0958", "+44 (0)20 7946 0958", "0044 20 7946 0958", "(020) 7946-0958", "+44.20.7946.0958"];
  for (const p of gb) assert.equal(toE164(p, "GB").e164, "+442079460958", p);
  assert.equal(toE164("(415) 555-0134", "US").e164, "+14155550134");
  assert.equal(toE164("1-415-555-0134 ext. 12", "US").e164, "+14155550134");
  assert.equal(toE164("030 1234567", "DE").e164, "+49301234567");
  // an international number wins over the record's country
  assert.equal(toE164("+33 1 23 45 67 89", "GB").e164, "+33123456789");
  assert.equal(toE164("12", "GB").e164, null);
  assert.equal(toE164("n/a", "GB").e164, null);
});

test("dates: ISO, day-first, month-first, text months, epochs and two-digit years", () => {
  assert.deepEqual(parseDate("2021-02-03"), { iso: "2021-02-03", ambiguous: false, format: "iso" });
  assert.equal(parseDate("25/12/2021").iso, "2021-12-25"); // only one reading is possible
  assert.equal(parseDate("12/25/2021").iso, "2021-12-25");
  const amb = parseDate("03/04/2021", "DMY");
  assert.equal(amb.iso, "2021-04-03");
  assert.equal(amb.ambiguous, true);
  assert.equal(parseDate("03/04/2021", "MDY").iso, "2021-03-04");
  assert.equal(parseDate("4 March 1987").iso, "1987-03-04");
  assert.equal(parseDate("Mar 4, 1987").iso, "1987-03-04");
  assert.equal(parseDate("14.03.87").iso, "1987-03-14");
  assert.equal(parseDate("01/02/05", "DMY").iso, "2005-02-01");
  assert.equal(parseDate("1609459200").iso, "2021-01-01");
  assert.equal(parseDate("2021-02-30").iso, null);
  assert.equal(parseDate("").format, "empty");
});

test("dates: a column's order is inferred from its unambiguous values", () => {
  assert.equal(inferDateOrder(["13/01/2020", "25/12/2021", "03/04/2021"]).order, "DMY");
  assert.equal(inferDateOrder(["01/13/2020", "12/25/2021", "03/04/2021"]).order, "MDY");
  assert.equal(inferDateOrder(["2020-01-13"]).order, null);
});

test("money: symbols, codes, decimal commas, thousands, and conversion to EUR at the fixed demo rates", () => {
  assert.deepEqual(parseMoney("€1.234,56"), { amount: 1234.56, currency: "EUR", decimalComma: true });
  assert.equal(parseMoney("$1,234.56").currency, "USD");
  assert.equal(parseMoney("$1,234.56").amount, 1234.56);
  assert.equal(parseMoney("GBP 99.90").currency, "GBP");
  assert.equal(parseMoney("1 234,50 kr").currency, "SEK");
  assert.equal(parseMoney("1 234,50 kr").amount, 1234.5);
  assert.equal(parseMoney("(12.00)").amount, -12);
  assert.equal(parseMoney("250", "GBP").currency, "GBP");
  assert.equal(parseMoney("").amount, null);
  assert.equal(toBase(100, "GBP"), 117);
  assert.equal(toBase(100, "EUR"), 100);
  assert.equal(toBase(100, null), null);
});

test("emails: lowercased, trimmed, mailto and +tags removed", () => {
  assert.deepEqual(canonicalEmail("  mailto:Ana.Ruiz+Billing@Mail.EXAMPLE "), { email: "ana.ruiz@mail.example", valid: true, plusTag: true, recased: true });
  assert.equal(canonicalEmail("not-an-email").valid, false);
  assert.equal(canonicalEmail("a@b").valid, false);
});

test("names: casing only fixes shouting and lowercase; full names split either way round", () => {
  assert.equal(properCase("O'NEILL"), "O'Neill");
  assert.equal(properCase("anne-marie mcdonald"), "Anne-Marie McDonald");
  assert.equal(properCase("van der Berg"), "van der Berg"); // mixed case is left as written
  assert.deepEqual([splitFullName("Ana Ruiz").first, splitFullName("Ana Ruiz").last], ["Ana", "Ruiz"]);
  assert.deepEqual([splitFullName("Ruiz, Ana").first, splitFullName("Ruiz, Ana").last], ["Ana", "Ruiz"]);
  assert.deepEqual([splitFullName("Dr. Jan van der Berg").first, splitFullName("Dr. Jan van der Berg").last], ["Jan", "van der Berg"]);
});

test("companies, streets, countries and null tokens", () => {
  assert.equal(companyKey("Lumen & Vale Ltd."), companyKey("LUMEN AND VALE LIMITED"));
  assert.equal(companyKey("Brightwater GmbH"), companyKey("brightwater"));
  assert.notEqual(companyKey("Brightwater Labs"), companyKey("Brightwater"));
  assert.equal(expandStreet("12 Harbour Rd."), "12 Harbour Road");
  assert.equal(expandStreet("Mühlenstr. 4"), "Mühlenstraße 4");
  assert.equal(toCountry("United Kingdom"), "GB");
  assert.equal(toCountry("U.K."), "GB");
  assert.equal(toCountry("Deutschland"), "DE");
  assert.equal(toCountry("nl"), "NL");
  assert.equal(toCountry("Atlantis"), null);
  for (const v of ["", "N/A", "null", " - ", "unknown"]) assert.equal(isNullish(v), true, v);
  assert.equal(isNullish("0"), false);
});

test("profile: value types and format masks", () => {
  assert.equal(classify("ana@mail.example"), "email");
  assert.equal(classify("2021-02-03"), "date");
  assert.equal(classify("+44 20 7946 0958"), "phone");
  assert.equal(classify("€1.234,56"), "money");
  assert.equal(classify("42"), "integer");
  assert.equal(formatMask("AB12 3CD"), "AA99 9AA");
  assert.equal(formatMask("ana@x.io"), "a+@a.a+"); // runs of lowercase collapse, so all emails share a few masks
});
