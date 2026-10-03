// The Anthropic Messages API on the wire, both ways:
//  - AnthropicUpstream calls POST /v1/messages with stream: true (from the
//    browser with the visitor's key, or from the Node server) and decodes the
//    SSE stream into the gateway's StreamEvents;
//  - AnthropicEncoder turns StreamEvents back into the same SSE events, which is
//    what makes the Node server a drop-in endpoint for Anthropic clients.

import { isAbort, AbortError } from "./clock";
import { UpstreamError, statusForErrorType } from "./errors";
import { newTextDecoder, type FetchLike } from "./platform";
import { SSEParser, encodeSSE, type SSEEvent } from "./sse";
import type { StreamEvent, Upstream, UpstreamCall } from "./types";

export const ANTHROPIC_VERSION = "2023-06-01";
export const ANTHROPIC_URL = "https://api.anthropic.com";

/**
 * Stateful decoder for one Anthropic message stream.
 *
 * Emits: start (message_start), text (text_delta), stop (message_stop, carrying
 * the stop_reason and output_tokens from message_delta). Thinking, signature and
 * tool-input deltas are consumed but not forwarded (thinking tokens are billed
 * through the final usage). `ping` and unknown event types are ignored, as the
 * API's versioning policy asks. An `error` event throws an UpstreamError.
 */
export class AnthropicStreamDecoder {
  model = "";
  inputTokens = 0;
  outputTokens = 0;
  stopReason: string | null = null;
  done = false;
  /** Content-block types seen, by index (text, thinking, tool_use, …). */
  blocks: string[] = [];

  push(ev: SSEEvent): StreamEvent[] {
    let msg: Record<string, any>;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      throw new UpstreamError("dropped", 0, "api_error", `unparseable ${ev.event} event`);
    }
    const type: string = msg.type ?? ev.event;
    switch (type) {
      case "message_start": {
        const m = msg.message ?? {};
        this.model = m.model ?? "";
        const u = m.usage ?? {};
        this.inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        this.outputTokens = u.output_tokens ?? 0;
        return [{ type: "start", model: this.model, inputTokens: this.inputTokens }];
      }
      case "content_block_start": {
        const b = msg.content_block ?? {};
        this.blocks[msg.index ?? this.blocks.length] = b.type;
        return b.type === "text" && b.text ? [{ type: "text", text: b.text }] : [];
      }
      case "content_block_delta": {
        const d = msg.delta ?? {};
        return d.type === "text_delta" && d.text ? [{ type: "text", text: d.text }] : [];
      }
      case "message_delta": {
        if (msg.delta?.stop_reason) this.stopReason = msg.delta.stop_reason;
        if (typeof msg.usage?.output_tokens === "number") {
          this.outputTokens = msg.usage.output_tokens;
          return [{ type: "usage", outputTokens: this.outputTokens }];
        }
        return [];
      }
      case "message_stop":
        this.done = true;
        return [{ type: "stop", reason: this.stopReason ?? "end_turn", outputTokens: this.outputTokens }];
      case "error": {
        const e = msg.error ?? {};
        const et = e.type ?? "api_error";
        throw new UpstreamError("http", statusForErrorType(et), et, e.message ?? "stream error");
      }
      default:
        return []; // ping, content_block_stop, and event types added after this was written
    }
  }
}

export interface AnthropicUpstreamOptions {
  apiKey: string;
  model: string;
  fetch: FetchLike;
  baseUrl?: string;
  /** Adds the header that lets a browser call the API directly with the user's own key. */
  browser?: boolean;
  /** output_config.effort for this model, where the model supports it. */
  effort?: "low" | "medium" | "high";
  region?: string;
}

/** Builds the Messages request body. Exported for tests. */
export function messagesBody(call: Pick<UpstreamCall, "model" | "system" | "messages" | "maxTokens">, effort?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: call.model,
    max_tokens: call.maxTokens,
    messages: call.messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  };
  if (call.system) body.system = call.system;
  if (effort) body.output_config = { effort };
  return body;
}

export class AnthropicUpstream implements Upstream {
  readonly kind = "anthropic" as const;
  readonly id: string;
  readonly model: string;
  readonly region: string;

  constructor(private readonly opts: AnthropicUpstreamOptions) {
    this.model = opts.model;
    this.region = opts.region ?? "anthropic";
    this.id = `${this.region}/${opts.model}`;
  }

  async open(call: UpstreamCall): Promise<AsyncIterable<StreamEvent>> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-api-key": this.opts.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    };
    if (this.opts.browser) headers["anthropic-dangerous-direct-browser-access"] = "true";
    let res;
    try {
      res = await this.opts.fetch(`${this.opts.baseUrl ?? ANTHROPIC_URL}/v1/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(messagesBody(call, this.opts.effort)),
        signal: call.signal,
      });
    } catch (e) {
      if (call.signal.aborted) throw new AbortError(call.signal.reason);
      throw new UpstreamError("network", 0, "network_error", e instanceof Error ? e.message : String(e));
    }
    if (!res.ok) {
      let type = "api_error";
      let message = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(await res.text());
        type = j.error?.type ?? type;
        message = j.error?.message ?? message;
      } catch {
        /* not JSON */
      }
      const ra = res.headers.get("retry-after");
      const retryAfterMs = ra !== null && Number.isFinite(Number(ra)) ? Number(ra) * 1000 : undefined;
      throw new UpstreamError("http", res.status, type, message, retryAfterMs);
    }
    if (!res.body) throw new UpstreamError("dropped", 0, "api_error", "empty body");
    return readStream(res.body.getReader(), call);
  }
}

async function* readStream(
  reader: { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(reason?: unknown): Promise<void> },
  call: UpstreamCall,
): AsyncGenerator<StreamEvent> {
  const text = newTextDecoder();
  const sse = new SSEParser();
  const dec = new AnthropicStreamDecoder();
  const onAbort = () => void reader.cancel(call.signal.reason).catch(() => {});
  call.signal.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (e) {
        if (call.signal.aborted || isAbort(e)) throw new AbortError(call.signal.reason);
        throw new UpstreamError("dropped", 0, "api_error", e instanceof Error ? e.message : "connection lost");
      }
      if (chunk.done) break;
      for (const ev of sse.push(text.decode(chunk.value, { stream: true }))) {
        for (const out of dec.push(ev)) yield out;
        if (dec.done) return;
      }
    }
    for (const ev of sse.push(text.decode())) for (const out of dec.push(ev)) yield out;
    if (!dec.done) {
      if (call.signal.aborted) throw new AbortError(call.signal.reason);
      throw new UpstreamError("dropped", 0, "api_error", "stream ended before message_stop");
    }
  } finally {
    call.signal.removeEventListener("abort", onAbort);
    if (!dec.done) await reader.cancel().catch(() => {});
  }
}

/** Turns the gateway's StreamEvents into Anthropic SSE frames. */
export class AnthropicEncoder {
  private started = false;
  private open = false;
  private inputTokens = 0;

  constructor(
    private readonly id: string,
    private readonly fallbackModel: string,
  ) {}

  encode(ev: StreamEvent): string {
    switch (ev.type) {
      case "start":
        return this.start(ev.model, ev.inputTokens);
      case "text": {
        const head = this.ensureStarted();
        return head + encodeSSE("content_block_delta", JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: ev.text } }));
      }
      case "usage":
        return "";
      case "stop": {
        let out = this.ensureStarted();
        if (this.open) out += encodeSSE("content_block_stop", JSON.stringify({ type: "content_block_stop", index: 0 }));
        this.open = false;
        out += encodeSSE(
          "message_delta",
          JSON.stringify({ type: "message_delta", delta: { stop_reason: ev.reason, stop_sequence: null }, usage: { output_tokens: ev.outputTokens } }),
        );
        return out + encodeSSE("message_stop", JSON.stringify({ type: "message_stop" }));
      }
      case "error":
        return encodeSSE("error", JSON.stringify({ type: "error", error: ev.error }));
    }
  }

  private ensureStarted(): string {
    return this.started ? "" : this.start(this.fallbackModel, this.inputTokens);
  }

  private start(model: string, inputTokens: number): string {
    if (this.started) return "";
    this.started = true;
    this.open = true;
    this.inputTokens = inputTokens;
    const message = {
      id: this.id,
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: 0 },
    };
    return (
      encodeSSE("message_start", JSON.stringify({ type: "message_start", message })) +
      encodeSSE("content_block_start", JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }))
    );
  }
}
