import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, jaccard, jaro, jaroWinkler, levenshtein, osa, tokenJaccard } from "../src/core/strsim";
import { soundex } from "../src/core/phonetic";
import { nicknameMatch, nicknameRoot } from "../src/core/nicknames";
import { murmur3, HyperLogLog } from "../src/core/hll";

const close = (a: number, b: number, eps = 5e-4) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("jaro-winkler: published reference values", () => {
  close(jaroWinkler("MARTHA", "MARHTA"), 0.961);
  close(jaroWinkler("DWAYNE", "DUANE"), 0.84);
  close(jaroWinkler("DIXON", "DICKSONX"), 0.813);
  close(jaro("MARTHA", "MARHTA"), 0.944);
  assert.equal(jaroWinkler("abc", ""), 0);
  assert.equal(jaroWinkler("same", "same"), 1);
  close(jaroWinkler("ab", "ba"), jaroWinkler("ba", "ab"), 1e-12);
});

test("edit distances: Levenshtein and optimal string alignment", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("flaw", "lawn"), 2);
  assert.equal(osa("ca", "ac"), 1); // a transposition is one edit
  assert.equal(levenshtein("ca", "ac"), 2);
  assert.equal(osa("martha", "marhta"), 1);
});

test("jaccard over tokens", () => {
  assert.equal(jaccard(["a", "b"], ["b", "c"]), 1 / 3);
  assert.equal(jaccard([], []), 1);
  assert.equal(tokenJaccard("Harbour Street 12", "12 harbour street"), 1);
});

test("fold: case, diacritics and special letters", () => {
  assert.equal(fold("Zoë Müller-Łukasz"), "zoe muller-lukasz");
  assert.equal(fold("Øster Straße"), "oster strasse");
});

test("soundex: American rules", () => {
  assert.equal(soundex("Robert"), "R163");
  assert.equal(soundex("Rupert"), "R163");
  assert.equal(soundex("Ashcraft"), "A261"); // h between s and c does not separate them
  assert.equal(soundex("Tymczak"), "T522");
  assert.equal(soundex("Pfister"), "P236"); // P and f share a code
  assert.equal(soundex("Honeyman"), "H555");
  assert.equal(soundex("Lee"), "L000");
});

test("nicknames: groups and roots", () => {
  assert.equal(nicknameMatch("bill", "william"), true);
  assert.equal(nicknameMatch("liz", "elizabeth"), true);
  assert.equal(nicknameMatch("bill", "robert"), false);
  assert.equal(nicknameRoot("bob"), nicknameRoot("robert"));
});

/** Textbook byte-at-a-time MurmurHash3 x86_32, to check the string version against. */
function murmurBytes(bytes: Uint8Array, seed: number): number {
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let h = seed >>> 0;
  const n = bytes.length;
  let i = 0;
  for (; i + 4 <= n; i += 4) {
    let k = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  let k = 0;
  switch (n & 3) {
    case 3:
      k ^= bytes[i + 2] << 16;
    // falls through
    case 2:
      k ^= bytes[i + 1] << 8;
    // falls through
    case 1:
      k ^= bytes[i];
      k = Math.imul(k, c1);
      k = (k << 15) | (k >>> 17);
      k = Math.imul(k, c2);
      h ^= k;
  }
  h ^= n;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const utf16le = (s: string) => {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) (out[2 * i] = s.charCodeAt(i) & 0xff), (out[2 * i + 1] = s.charCodeAt(i) >> 8);
  return out;
};

test("murmur3: the byte reference passes the published vectors, and the string version equals it over UTF-16LE", () => {
  const ascii = (s: string) => new TextEncoder().encode(s);
  assert.equal(murmurBytes(ascii(""), 0), 0);
  assert.equal(murmurBytes(ascii(""), 1), 0x514e28b7);
  assert.equal(murmurBytes(ascii("test"), 0), 0xba6bd213);
  assert.equal(murmurBytes(ascii("Hello, world!"), 0x9747b28c), 0x24884cba);
  assert.equal(murmurBytes(ascii("The quick brown fox jumps over the lazy dog"), 0x9747b28c), 0x2fa826cd);
  for (const s of ["", "a", "ab", "abc", "Zoë Müller", "customer-123456", "😀 emoji", "x".repeat(101)])
    for (const seed of [0, 1, 0x9747b28c]) assert.equal(murmur3(s, seed), murmurBytes(utf16le(s), seed), `${s} / ${seed}`);
});

test("hyperloglog: error within 3 standard errors from 1k to 1M distinct values", () => {
  for (const n of [1_000, 10_000, 100_000, 1_000_000]) {
    const h = new HyperLogLog(12);
    for (let i = 0; i < n; i++) h.add(`value-${i}`);
    const err = Math.abs(h.count() - n) / n;
    assert.ok(err < 3 * h.standardError, `n=${n}: error ${err}`);
  }
});

test("hyperloglog: duplicates do not count, small sets are near exact, merge equals union", () => {
  const h = new HyperLogLog(12);
  for (let r = 0; r < 5; r++) for (let i = 0; i < 200; i++) h.add(`x${i}`);
  assert.ok(Math.abs(h.count() - 200) <= 2, String(h.count()));
  const a = new HyperLogLog(10);
  const b = new HyperLogLog(10);
  const both = new HyperLogLog(10);
  for (let i = 0; i < 5000; i++) {
    (i % 2 ? a : b).add(`k${i}`);
    both.add(`k${i}`);
  }
  a.merge(b);
  assert.equal(a.count(), both.count());
});
