import { test } from "node:test";
import assert from "node:assert/strict";
import { formatIban, ibanCheckDigits, ibanValid, isCardNumber, luhn, luhnCheckDigit } from "../src/core/checks";
import { detectPii, DEFAULT_POLICY, mask, redact, segmentsToText, Tokenizer } from "../src/core/pii";

test("luhn: reference numbers", () => {
  assert.equal(luhn("79927398713"), true);
  for (const bad of ["79927398710", "79927398711", "79927398712", "79927398714"]) assert.equal(luhn(bad), false, bad);
  assert.equal(luhn("4539148803436467"), true);
  assert.equal(luhnCheckDigit("7992739871"), "3");
  // every single-digit error is caught
  const good = "4111111111111111";
  for (let i = 0; i < good.length; i++)
    for (let d = 0; d <= 9; d++) {
      if (String(d) === good[i]) continue;
      assert.equal(luhn(good.slice(0, i) + d + good.slice(i + 1)), false);
    }
});

test("card: needs a network prefix and a plausible length, not just Luhn", () => {
  assert.equal(isCardNumber("4111111111111111"), true); // Visa test number
  assert.equal(isCardNumber("5500000000000004"), true); // Mastercard test number
  assert.equal(isCardNumber("378282246310005"), true); // Amex test number
  assert.equal(isCardNumber("79927398713"), false); // Luhn-valid, too short
  assert.equal(isCardNumber("0000000000000000"), false);
});

test("iban: mod-97 and the per-country length", () => {
  assert.equal(ibanValid("GB82 WEST 1234 5698 7654 32"), true);
  assert.equal(ibanValid("DE89 3704 0044 0532 0130 00"), true);
  assert.equal(ibanValid("NL91ABNA0417164300"), true);
  assert.equal(ibanValid("GB82 WEST 1234 5698 7654 33"), false); // one digit off
  assert.equal(ibanValid("GB82 WEST 1234 5698 7654 3"), false); // too short for GB
  assert.equal(ibanValid("XX82 WEST 1234 5698 7654 32"), false); // unknown country
  assert.equal(ibanCheckDigits("GB", "WEST12345698765432"), "82");
  assert.equal(formatIban("gb82west12345698765432"), "GB82 WEST 1234 5698 7654 32");
});

test("pii: finds emails, phones, cards, IBANs and keyword-anchored birth dates in free text", () => {
  const text = "Call +44 20 7946 0958 or mail Ana.Ruiz+billing@mail.example. Card 4111 1111 1111 1111, IBAN GB82 WEST 1234 5698 7654 32, DOB 14/03/1987.";
  const spans = detectPii(text);
  const got = spans.map((s) => [s.type, s.value]);
  assert.deepEqual(got, [
    ["phone", "+44 20 7946 0958"],
    ["email", "Ana.Ruiz+billing@mail.example"],
    ["card", "4111 1111 1111 1111"],
    ["iban", "GB82 WEST 1234 5698 7654 32"],
    ["dob", "14/03/1987"],
  ]);
  for (const s of spans) assert.equal(text.slice(s.start, s.end), s.value);
});

test("pii: validation rejects the regex look-alikes", () => {
  // order numbers, invoice ids, Luhn-invalid card-shaped numbers, dates without a birth keyword
  const text = "Order 4111 1111 1111 1112 shipped 2023-04-05, invoice GB00 0000 0000 0000 0000 00, ref 2024-118-77.";
  assert.deepEqual(detectPii(text), []);
  assert.ok(detectPii(text, { validate: false }).length > 0, "the regex-only baseline flags them");
});

test("pii: masks keep the shape and the last digits", () => {
  assert.equal(mask("card", "4111 1111 1111 1111"), "•••• •••• •••• 1111");
  assert.match(mask("email", "ana.ruiz@mail.example"), /^a•+@mail\.example$/);
  assert.equal(mask("iban", "GB82 WEST 1234 5698 7654 32"), "GB•• •••• •••• •••• ••54 32");
});

test("hmac-sha256 matches RFC 4231 test case 2", async () => {
  const t = new Tokenizer("Jefe");
  assert.equal(await t.hmacHex("what do ya want for nothing?"), "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
});

test("tokens: deterministic per key, equal across spellings of the same value, different across keys", async () => {
  const a = new Tokenizer("key-1");
  const b = new Tokenizer("key-2");
  const t1 = await a.token("email", "Ana.Ruiz@Mail.example");
  const t2 = await a.token("email", " ana.ruiz@mail.example ");
  const t3 = await b.token("email", "ana.ruiz@mail.example");
  assert.match(t1, /^email_[0-9a-f]{12}$/);
  assert.equal(t1, t2);
  assert.notEqual(t1, t3);
  assert.equal(await a.token("phone", "+44 20 7946 0958"), await a.token("phone", "+442079460958"));
});

test("redact: applies the policy span by span and leaves the rest of the text alone", async () => {
  const text = "Mail ana@mail.example, card 4111 1111 1111 1111.";
  const segs = await redact(text, detectPii(text), DEFAULT_POLICY, new Tokenizer("k"));
  const out = segmentsToText(segs);
  assert.match(out, /^Mail email_[0-9a-f]{12}, card •••• •••• •••• 1111\.$/);
  const kept = await redact(text, detectPii(text), { ...DEFAULT_POLICY, email: "keep", card: "keep" }, new Tokenizer("k"));
  assert.equal(segmentsToText(kept), text);
});
