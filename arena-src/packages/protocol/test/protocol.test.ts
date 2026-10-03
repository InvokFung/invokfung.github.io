import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClientMessage, sanitizeName, type ClientMessage } from "@arena/protocol";

test("accepts well-formed messages and returns exactly the declared fields", () => {
  const msgs: ClientMessage[] = [
    { type: "hello", protocol: 1, name: "Afung" },
    { type: "hello", protocol: 1, name: "Afung", token: "p_abc.sig" },
    { type: "create_room", cardCount: 18, maxPlayers: 4, bots: 2, botLevel: "adept" },
    { type: "create_room", cardCount: 18, maxPlayers: 4, bots: 0, botLevel: "ace", code: "K7Q2M" },
    { type: "join_room", code: "ABCDE" },
    { type: "flip", matchId: "m_abc123xyz", card: 7 },
    { type: "flip", matchId: "m_abc123xyz", card: 7, ref: 42 },
    { type: "focus", matchId: "m_abc123xyz", card: null },
    { type: "ping", t: 123.5 },
    { type: "list_replays" },
  ];
  for (const m of msgs) {
    const r = parseClientMessage(JSON.parse(JSON.stringify(m)));
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepEqual(r.value, m);
  }
});

test("rejects malformed, oversized, unknown and smuggled input", () => {
  const bad: unknown[] = [
    null,
    42,
    "flip",
    [],
    {},
    { type: "nope" },
    { type: "__proto__" },
    { type: "toString" },
    { type: "flip", matchId: "m_abc123xyz" },
    { type: "flip", matchId: "m_abc123xyz", card: "7" },
    { type: "flip", matchId: "m_abc123xyz", card: 7.5 },
    { type: "flip", matchId: "m_abc123xyz", card: -1 },
    { type: "flip", matchId: "m_abc123xyz", card: 1e9 },
    { type: "flip", matchId: "M_ABC", card: 1 },
    { type: "flip", matchId: "m_abc123xyz", card: 1, playerId: "p_someoneelse" }, // identity comes from the connection, never the payload
    { type: "hello", protocol: 1, name: "" },
    { type: "hello", protocol: 1, name: "x".repeat(41) },
    { type: "create_room", cardCount: 18, maxPlayers: 9, bots: 0, botLevel: "adept" },
    { type: "create_room", cardCount: 18, maxPlayers: 4, bots: 0, botLevel: "god" },
    { type: "join_room", code: "abcde" },
    { type: "join_room", code: "AB0DE" }, // 0 is not in the unambiguous alphabet
    { type: "ping", t: Number.POSITIVE_INFINITY },
  ];
  for (const b of bad) assert.equal(parseClientMessage(b).ok, false, JSON.stringify(b));
  const r = parseClientMessage({ type: "flip", matchId: "m_abc123xyz", card: 1, playerId: "p_x" });
  assert.ok(!r.ok && r.issue.path === "$.playerId");
});

test("names are cleaned for display", () => {
  assert.equal(sanitizeName("  Ada\u0000  Lovelace \n"), "Ada Lovelace");
  assert.equal(sanitizeName("​​"), "Player");
  assert.equal(sanitizeName("x".repeat(30)).length, 18);
  assert.equal(sanitizeName("🃏🃏🃏"), "🃏🃏🃏");
});
