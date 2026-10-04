import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AnthropicEncoder,
  AnthropicStreamDecoder,
  AnthropicUpstream,
  CATALOG,
  messagesBody,
  seeded,
  SSEParser,
  UpstreamError,
  type FetchLike,
  type SSEEvent,
  type StreamEvent,
} from "@relay/core";

const fixture = (name: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", name), "utf8");

const parseAll = (chunks: string[]) => {
  const p = new SSEParser();
  return chunks.flatMap((c) => p.push(c));
};

test("SSE: fields, multi-line data, comments, missing colon, one optional space", () => {
  const evs = parseAll([": a comment\nevent: greet\ndata: line one\ndata:line two\ndata:  two spaces\nid: 7\nretry: 1500\n\ndata\n\nevent: empty-data-ignored\n\n"]);
  assert.deepEqual(evs, [
    { event: "greet", data: "line one\nline two\n two spaces", id: "7", retry: 1500 },
    { event: "message", data: "", id: "7", retry: 1500 },
  ]);
});

test("SSE: CR, LF and CRLF line endings, including a CRLF split across chunks", () => {
  const want = [
    { event: "a", data: "1" },
    { event: "b", data: "2" },
    { event: "c", data: "3" },
  ];
  assert.deepEqual(parseAll(["event: a\rdata: 1\r\revent: b\ndata: 2\n\nevent: c\r\ndata: 3\r\n\r\n"]), want);
  assert.deepEqual(parseAll(["event: a\r", "\ndata: 1\r", "\n\r", "\nevent: b\ndata: 2\n\nevent: c\r\ndata: 3\r\n\r", "\n"]), want);
});

test("SSE: a leading BOM is ignored and an unterminated final event is not dispatched", () => {
  assert.deepEqual(parseAll(["﻿data: x\n\ndata: never finished"]), [{ event: "message", data: "x" }]);
});

test("SSE: every Anthropic fixture parses the same in one piece, byte by byte and at random cuts", () => {
  for (const name of ["basic.sse", "thinking.sse", "overloaded.sse", "refusal.sse"]) {
    const text = fixture(name);
    const whole = parseAll([text]);
    assert.ok(whole.length >= 4, name);
    assert.deepEqual(parseAll([...text]), whole, `${name} char by char`);
    const crlf = text.replace(/\n/g, "\r\n");
    assert.deepEqual(parseAll([crlf]), whole, `${name} with CRLF`);
    // Random byte cuts through UTF-8 (the fixtures contain é and ☕), decoded in stream mode.
    const bytes = new TextEncoder().encode(text);
    const rng = seeded(name.length);
    for (let trial = 0; trial < 50; trial++) {
      const dec = new TextDecoder();
      const p = new SSEParser();
      const out: SSEEvent[] = [];
      let i = 0;
      while (i < bytes.length) {
        const n = 1 + Math.floor(rng.next() * 40);
        out.push(...p.push(dec.decode(bytes.subarray(i, i + n), { stream: true })));
        i += n;
      }
      out.push(...p.push(dec.decode()));
      assert.deepEqual(out, whole, `${name} trial ${trial}`);
    }
  }
});

function decodeFixture(name: string): StreamEvent[] {
  const d = new AnthropicStreamDecoder();
  return parseAll([fixture(name)]).flatMap((e) => d.push(e));
}

test("Anthropic decoder: text deltas, usage and stop reason; pings ignored", () => {
  const evs = decodeFixture("basic.sse");
  assert.deepEqual(evs[0], { type: "start", model: "claude-sonnet-5-5", inputTokens: 25 });
  assert.equal(
    evs
      .filter((e) => e.type === "text")
      .map((e) => (e as { text: string }).text)
      .join(""),
    "I'll send the receipt to <EMAIL_1> — café ☕ done.",
  );
  assert.deepEqual(evs.at(-2), { type: "usage", outputTokens: 15 });
  assert.deepEqual(evs.at(-1), { type: "stop", reason: "end_turn", outputTokens: 15 });
});

test("Anthropic decoder: thinking and signature deltas are consumed, unknown events ignored", () => {
  const evs = decodeFixture("thinking.sse");
  assert.deepEqual(
    evs.map((e) => e.type),
    ["start", "text", "usage", "stop"],
  );
  assert.deepEqual(evs[1], { type: "text", text: "The answer is 391." });
  assert.deepEqual(evs[3], { type: "stop", reason: "end_turn", outputTokens: 212 });
});

test("Anthropic decoder: refusal is a stop reason, not an error", () => {
  assert.deepEqual(decodeFixture("refusal.sse").at(-1), { type: "stop", reason: "refusal", outputTokens: 8 });
});

test("Anthropic decoder: an error event mid-stream throws a retryable 529", () => {
  assert.throws(
    () => decodeFixture("overloaded.sse"),
    (e: unknown) => e instanceof UpstreamError && e.status === 529 && e.errorType === "overloaded_error" && e.retryable,
  );
});

/** A fetch double that records the request and streams `body` in small chunks. */
function fakeFetch(status: number, body: string, headers: Record<string, string> = {}) {
  const seen: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  let cancelled = false;
  const f: FetchLike = async (url, init) => {
    seen.push({ url, init });
    const bytes = new TextEncoder().encode(body);
    let i = 0;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
      text: async () => body,
      body: {
        getReader: () => ({
          read: async () => {
            if (init.signal.aborted) throw new Error("aborted");
            if (i >= bytes.length) return { done: true };
            const v = bytes.subarray(i, i + 7);
            i += 7;
            return { done: false, value: v };
          },
          cancel: async () => void (cancelled = true),
        }),
      },
    };
  };
  return { f, seen, cancelled: () => cancelled };
}

test("Anthropic upstream: request shape and headers, from a browser", async () => {
  const { f, seen } = fakeFetch(200, fixture("basic.sse"));
  const up = new AnthropicUpstream({ apiKey: "test-key-not-real", model: "claude-sonnet-5-5", fetch: f, browser: true, effort: "low" });
  const ctrl = new AbortController();
  const out: StreamEvent[] = [];
  for await (const ev of await up.open({ model: "claude-sonnet-5-5", system: "Be brief.", messages: [{ role: "user", content: "hi" }], maxTokens: 256, signal: ctrl.signal })) out.push(ev);
  assert.equal(seen[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(seen[0].init.method, "POST");
  assert.deepEqual(seen[0].init.headers, {
    "content-type": "application/json",
    "x-api-key": "test-key-not-real",
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  });
  assert.deepEqual(JSON.parse(seen[0].init.body), {
    model: "claude-sonnet-5-5",
    max_tokens: 256,
    messages: [{ role: "user", content: "hi" }],
    stream: true,
    system: "Be brief.",
    output_config: { effort: "low" },
  });
  assert.deepEqual(out.at(-1), { type: "stop", reason: "end_turn", outputTokens: 15 });
  // No sampling parameters: the current models reject temperature/top_p.
  assert.equal("temperature" in messagesBody({ model: "m", messages: [], maxTokens: 1 }), false);
});

test("Anthropic upstream: HTTP errors become UpstreamErrors with retry-after in ms", async () => {
  const { f } = fakeFetch(429, JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }), { "retry-after": "2" });
  const up = new AnthropicUpstream({ apiKey: "k", model: "claude-haiku-4-5", fetch: f });
  await assert.rejects(
    up.open({ model: "claude-haiku-4-5", messages: [{ role: "user", content: "x" }], maxTokens: 8, signal: new AbortController().signal }),
    (e: unknown) => e instanceof UpstreamError && e.status === 429 && e.retryAfterMs === 2000 && e.retryable,
  );
  const bad = fakeFetch(400, JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "bad" } }));
  await assert.rejects(
    new AnthropicUpstream({ apiKey: "k", model: "m", fetch: bad.f }).open({ model: "m", messages: [], maxTokens: 1, signal: new AbortController().signal }),
    (e: unknown) => e instanceof UpstreamError && !e.retryable,
  );
});

test("Anthropic upstream: a stream that ends without message_stop is a drop; abort cancels the reader", async () => {
  const cut = fixture("basic.sse").split("event: message_delta")[0];
  const { f } = fakeFetch(200, cut);
  const up = new AnthropicUpstream({ apiKey: "k", model: "m", fetch: f });
  const it = await up.open({ model: "m", messages: [], maxTokens: 1, signal: new AbortController().signal });
  await assert.rejects(
    (async () => {
      for await (const _ of it) void _;
    })(),
    (e: unknown) => e instanceof UpstreamError && e.kind === "dropped",
  );

  const slow = fakeFetch(200, fixture("basic.sse"));
  const ctrl = new AbortController();
  const s = await new AnthropicUpstream({ apiKey: "k", model: "m", fetch: slow.f }).open({ model: "m", messages: [], maxTokens: 1, signal: ctrl.signal });
  const iter = s[Symbol.asyncIterator]();
  await iter.next();
  ctrl.abort();
  await assert.rejects(iter.next());
  assert.equal(slow.cancelled(), true);
});

test("encoder → parser → decoder round trip reproduces the stream", () => {
  const events: StreamEvent[] = [
    { type: "start", model: "claude-haiku-4-5", inputTokens: 9 },
    { type: "text", text: "Hello\nworld " },
    { type: "text", text: "<EMAIL_1>" },
    { type: "stop", reason: "end_turn", outputTokens: 4 },
  ];
  const enc = new AnthropicEncoder("msg_x", "claude-haiku-4-5");
  const sse = events.map((e) => enc.encode(e)).join("");
  assert.match(sse, /^event: message_start\n/);
  const dec = new AnthropicStreamDecoder();
  const back = parseAll([sse]).flatMap((e) => dec.push(e));
  assert.deepEqual(
    back.filter((e) => e.type !== "usage"),
    events,
  );
  const err = new AnthropicEncoder("m", "x").encode({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
  assert.equal(err, 'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n');
});

test("Catalog: real calls to the thinking models ask for low effort, Haiku gets none", () => {
  // Thinking tokens count against max_tokens, so a short demo answer needs low effort.
  const effort = Object.fromEntries(CATALOG.map((m) => [m.tier, m.effort]));
  assert.deepEqual(effort, { fast: undefined, balanced: "low", best: "low" });
});
