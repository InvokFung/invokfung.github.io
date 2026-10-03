import { test } from "node:test";
import assert from "node:assert/strict";
import { detect, ibanValid, luhn, redact, restore, seeded, StreamRestorer, Vault } from "@relay/core";

const types = (s: string) => detect(s).map((f) => `${f.type}:${f.value}`);

test("detectors: emails, phones, cards, IBANs and cued names, with exact spans", () => {
  const s = "I'm Dana Reyes, email dana.reyes@example.com, call +1 415 555 0132, card 4111-1111-1111-1111, IBAN GB82 WEST 1234 5698 7654 32 please.";
  assert.deepEqual(types(s), ["NAME:Dana Reyes", "EMAIL:dana.reyes@example.com", "PHONE:+1 415 555 0132", "CARD:4111-1111-1111-1111", "IBAN:GB82 WEST 1234 5698 7654 32"]);
  for (const f of detect(s)) assert.equal(s.slice(f.start, f.end), f.value);
});

test("cards need a valid Luhn checksum and a real issuer prefix", () => {
  assert.equal(luhn("4111111111111111"), true);
  assert.equal(luhn("4111111111111112"), false);
  assert.deepEqual(types("card 4111 1111 1111 1112"), [], "fails Luhn");
  assert.deepEqual(types("ref 1234 5678 9012 3452"), [], "Luhn-valid but no issuer starts with 1");
  assert.deepEqual(types("amex 3782 822463 10005"), ["CARD:3782 822463 10005"]);
});

test("IBANs need the country's length and a mod-97 check, and do not swallow the next word", () => {
  assert.equal(ibanValid("DE89370400440532013000"), true);
  assert.equal(ibanValid("DE89370400440532013001"), false);
  assert.deepEqual(types("pay DE89 3704 0044 0532 0130 00 TODAY"), ["IBAN:DE89 3704 0044 0532 0130 00"]);
  assert.deepEqual(types("pay DE89 3704 0044 0532 0130 01"), [], "bad check digits");
});

test("things that look like PII but are not", () => {
  for (const s of [
    "order number 415-555-0132 is late", // vetoed by the order cue
    "released on 2024-03-15 at 10:30",
    "upgrade to version 1.2.3 or 10.4.22",
    "the total was 1,234,567.89",
    "I'm Sorry for the delay",
    "Thanks for the quick reply",
    "user@localhost is not a routable email",
  ])
    assert.deepEqual(types(s), [], s);
});

test("the same value always gets the same placeholder; types are numbered separately", () => {
  const v = new Vault();
  const r = redact("Mail a@example.com or A@Example.com, then b@example.com; call +44 20 7946 0958.", v);
  assert.equal(r.text, "Mail <EMAIL_1> or <EMAIL_1>, then <EMAIL_2>; call <PHONE_1>.");
  assert.equal(v.original("<EMAIL_1>"), "a@example.com");
});

test("mask mode is one-way", () => {
  const v = new Vault();
  const r = redact("card 5555 5555 5555 4444", v, "mask");
  assert.equal(r.text, "card [CARD]");
  assert.equal(v.size, 0);
  assert.equal(restore(r.text, v), "card [CARD]");
});

test("round trip: restore(redact(x)) = x on 500 generated messages", () => {
  const rng = seeded(11);
  const pick = <T>(xs: T[]) => xs[Math.floor(rng.next() * xs.length)];
  const parts = ["hello", "my email is mei.chen@example.com", "call (212) 555-0187", "card 5105 1051 0510 5100", "IBAN NL91 ABNA 0417 1643 00", "I'm Oliver Grant", "a < b and c > d", "<div>", "order A-1234", "x"];
  for (let i = 0; i < 500; i++) {
    const s = Array.from({ length: 1 + Math.floor(rng.next() * 6) }, () => pick(parts)).join(". ");
    const v = new Vault();
    const r = redact(s, v);
    assert.equal(restore(r.text, v), s);
  }
});

test("streaming restore: identical output at every single split point, with split placeholders counted", () => {
  const v = new Vault();
  const r = redact("Contact dana.reyes@example.com or +1 415 555 0132 about card 4242 4242 4242 4242.", v);
  const upstream = `Sure: I'll write to ${r.text.match(/<EMAIL_1>/)![0]}, call <PHONE_1>, and note <CARD_1>. Also a < b, <b>bold</b>, and <EMAIL_9>.`;
  const want = restore(upstream, v);
  assert.ok(want.includes("dana.reyes@example.com") && want.includes("+1 415 555 0132") && want.includes("4242 4242 4242 4242"));
  assert.ok(want.includes("<EMAIL_9>"), "unknown placeholders pass through");
  for (let cut = 0; cut <= upstream.length; cut++) {
    const s = new StreamRestorer(v);
    const out = s.push(upstream.slice(0, cut)) + s.push(upstream.slice(cut)) + s.flush();
    assert.equal(out, want, `split at ${cut}`);
    assert.equal(s.restored, 3);
  }
  // One character per chunk: every placeholder arrives split.
  const s = new StreamRestorer(v);
  let out = "";
  for (const ch of upstream) out += s.push(ch);
  out += s.flush();
  assert.equal(out, want);
  assert.equal(s.split, 3);
});

test("streaming restore: random chunkings of random text", () => {
  const rng = seeded(5);
  const v = new Vault();
  redact("a@example.com b@example.org +44 20 7946 0958 4111 1111 1111 1111 I'm Sarah Kim", v);
  const atoms = ["<EMAIL_1>", "<EMAIL_2>", "<PHONE_1>", "<CARD_1>", "<NAME_1>", "<EMAIL_7>", "<", ">", "<EM", "AIL", "_1", " text ", "<NAME", "x<y", "\n"];
  for (let trial = 0; trial < 300; trial++) {
    const text = Array.from({ length: 5 + Math.floor(rng.next() * 25) }, () => atoms[Math.floor(rng.next() * atoms.length)]).join("");
    const want = restore(text, v);
    const s = new StreamRestorer(v);
    let out = "";
    let i = 0;
    while (i < text.length) {
      const n = 1 + Math.floor(rng.next() * 6);
      out += s.push(text.slice(i, i + n));
      i += n;
    }
    out += s.flush();
    assert.equal(out, want, JSON.stringify(text));
  }
});

test("streaming restore holds back at most one partial placeholder", () => {
  const v = new Vault();
  redact("x@example.com", v);
  const s = new StreamRestorer(v);
  assert.equal(s.push("Write to <EM"), "Write to ");
  assert.equal(s.holding, 3);
  assert.equal(s.push("AIL_1> now <A"), "x@example.com now <A", "<A cannot start a placeholder, so it is not held");
  assert.equal(s.push("BC>"), "BC>");
  assert.equal(s.push("<EMAIL_1"), "");
  assert.equal(s.flush(), "<EMAIL_1", "an unterminated placeholder is released as text at the end");
});
