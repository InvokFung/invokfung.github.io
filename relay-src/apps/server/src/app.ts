// The Node host: an Anthropic-compatible POST /v1/messages (JSON or SSE), a
// Prometheus /metrics endpoint, a per-tenant /audit endpoint and /healthz.
// Everything interesting happens in @relay/core; this file only translates
// HTTP to gateway calls and back, and turns a closed socket into a cancel.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AnthropicEncoder, statusForErrorType, type ChatMessage, type Gateway, type RelayRequest, type StreamEvent } from "@relay/core";

export interface AppOptions {
  gateway: Gateway;
  upstream: "simulator" | "anthropic";
  /** One line per request; never receives keys or message text. */
  log?: (line: Record<string, unknown>) => void;
  maxBodyBytes?: number;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    message: string,
  ) {
    super(message);
  }
}

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  const s = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(s), ...headers });
  res.end(s);
};

const apiError = (res: ServerResponse, status: number, type: string, message: string, headers: Record<string, string> = {}) =>
  json(res, status, { type: "error", error: { type, message } }, headers);

async function readBody(req: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req as AsyncIterable<Buffer>) {
    n += c.length;
    if (n > limit) throw new HttpError(413, "request_too_large", `request body over ${limit} bytes`);
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Text content as a string: plain strings and arrays of text blocks are accepted, anything else is refused. */
function textOf(content: unknown, where: string): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b, i) => {
        if (b && typeof b === "object" && (b as { type?: unknown }).type === "text" && typeof (b as { text?: unknown }).text === "string") return (b as { text: string }).text;
        throw new HttpError(400, "invalid_request_error", `${where}[${i}]: only text blocks are supported by this gateway`);
      })
      .join("\n");
  }
  throw new HttpError(400, "invalid_request_error", `${where}: expected a string or an array of text blocks`);
}

export function parseMessagesRequest(raw: string, apiKey: string): RelayRequest {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid_request_error", "body is not valid JSON");
  }
  if (!body || typeof body !== "object") throw new HttpError(400, "invalid_request_error", "body must be a JSON object");
  if (typeof body.model !== "string" || !body.model) throw new HttpError(400, "invalid_request_error", "model: required string");
  const maxTokens = body.max_tokens;
  if (typeof maxTokens !== "number" || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 64_000) throw new HttpError(400, "invalid_request_error", "max_tokens: integer between 1 and 64000");
  if (!Array.isArray(body.messages) || body.messages.length === 0) throw new HttpError(400, "invalid_request_error", "messages: non-empty array required");
  const messages: ChatMessage[] = body.messages.map((m: unknown, i: number) => {
    const role = (m as { role?: unknown })?.role;
    if (role !== "user" && role !== "assistant") throw new HttpError(400, "invalid_request_error", `messages[${i}].role: user or assistant`);
    return { role, content: textOf((m as { content?: unknown }).content, `messages[${i}].content`) };
  });
  if (messages[messages.length - 1].role !== "user") throw new HttpError(400, "invalid_request_error", "the last message must be from the user");
  const system = body.system === undefined ? undefined : textOf(body.system, "system");
  return { apiKey, model: body.model, system, messages, maxTokens, stream: body.stream === true };
}

function apiKeyOf(req: IncomingMessage): string {
  const k = req.headers["x-api-key"];
  if (typeof k === "string" && k) return k;
  const auth = req.headers.authorization;
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "");
  return "";
}

export function createApp(opts: AppOptions): Server & { inflight: () => number } {
  const { gateway: gw } = opts;
  const log = opts.log ?? (() => {});
  const limit = opts.maxBodyBytes ?? 1 << 20;
  const started = Date.now();
  let inflight = 0;

  async function messages(req: IncomingMessage, res: ServerResponse) {
    const relayReq = parseMessagesRequest(await readBody(req, limit), apiKeyOf(req));
    // A closed socket before the response ends cancels the request, which cancels the upstream call.
    const ctrl = new AbortController();
    const onClose = () => {
      if (!res.writableFinished) ctrl.abort(new Error("client disconnected"));
    };
    res.on("close", onClose);
    const r = await gw.handle(relayReq, { signal: ctrl.signal });
    const headers = { ...r.headers };
    if (!r.events) {
      apiError(res, r.status, r.error!.type, r.error!.message, headers);
    } else if (relayReq.stream) {
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no", ...headers });
      res.flushHeaders();
      const enc = new AnthropicEncoder(r.id, relayReq.model);
      for await (const ev of r.events) {
        if (res.destroyed) break;
        const frame = enc.encode(ev);
        if (frame && !res.write(frame)) await new Promise<void>((ok) => (res.destroyed ? ok() : res.once("drain", ok).once("close", ok)));
      }
      res.end();
    } else {
      let text = "";
      let model = relayReq.model;
      let stop: Extract<StreamEvent, { type: "stop" }> | null = null;
      let inputTokens = 0;
      let failure: Extract<StreamEvent, { type: "error" }> | null = null;
      for await (const ev of r.events) {
        if (ev.type === "start") (model = ev.model), (inputTokens = ev.inputTokens);
        else if (ev.type === "text") text += ev.text;
        else if (ev.type === "stop") stop = ev;
        else if (ev.type === "error") failure = ev;
      }
      if (failure || !stop) {
        const e = failure?.error ?? { type: "api_error", message: "stream ended early" };
        apiError(res, e.type === "budget_exceeded_error" ? 402 : statusForErrorType(e.type), e.type, e.message, headers);
      } else
        json(
          res,
          200,
          {
            id: r.id,
            type: "message",
            role: "assistant",
            model,
            content: [{ type: "text", text }],
            stop_reason: stop.reason,
            stop_sequence: null,
            usage: { input_tokens: inputTokens, output_tokens: stop.outputTokens },
          },
          headers,
        );
    }
    const s = await r.done;
    res.off("close", onClose);
    log({ id: s.id, tenant: s.tenant, status: s.status, outcome: s.outcome, model: s.model, upstream: s.upstream ?? null, cache: s.cache, attempts: s.attempts, ms: Math.round(s.latencyMs), costUsd: s.costUsd });
  }

  function audit(req: IncomingMessage, res: ServerResponse, url: URL) {
    const key = apiKeyOf(req);
    const tenant = key ? gw.getTenants().find((t) => t.keys.includes(key)) : undefined;
    if (!tenant) return apiError(res, 401, "authentication_error", "a tenant key is required; each tenant sees only its own records");
    const n = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
    // The chain is verified over the whole log, then filtered to the caller's records.
    json(res, 200, { tenant: tenant.id, chain: gw.audit.verify(), anchor: gw.audit.anchor, records: gw.audit.list({ tenant: tenant.id, limit: n }) });
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://relay.local");
    inflight++;
    res.on("close", () => inflight--);
    const route = `${req.method} ${url.pathname}`;
    const run = async () => {
      switch (route) {
        case "POST /v1/messages":
          return messages(req, res);
        case "GET /metrics": {
          const body = gw.renderMetrics();
          res.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
          return void res.end(body);
        }
        case "GET /audit":
          return audit(req, res, url);
        case "GET /healthz":
          return json(res, 200, { ok: true, upstream: opts.upstream, stable: gw.stable, uptimeS: Math.round((Date.now() - started) / 1000), breakers: gw.breakerStates() });
        default:
          if (url.pathname === "/v1/messages" || url.pathname === "/metrics" || url.pathname === "/audit") return apiError(res, 405, "invalid_request_error", `${req.method} not allowed`);
          return apiError(res, 404, "not_found_error", `no route for ${route}`);
      }
    };
    run().catch((e) => {
      if (res.headersSent) return void res.destroy();
      if (e instanceof HttpError) apiError(res, e.status, e.type, e.message);
      else apiError(res, 500, "api_error", "internal error");
      if (!(e instanceof HttpError)) log({ error: e instanceof Error ? e.message : String(e) });
    });
  });
  return Object.assign(server, { inflight: () => inflight });
}

