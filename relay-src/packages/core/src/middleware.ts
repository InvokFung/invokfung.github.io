// The nine stages. Each is a small object with a request-phase `handle` and,
// where it needs one, a stream-phase hook. Order of execution (outermost first):
//   audit → auth → limit → redact → screen → cache → route → meter → resilience
// Audit is outermost so it sees every outcome, including requests that never
// got past auth; meter wraps resilience so it can stop the winning stream.

import type { TokenBucket } from "./bucket";
import type { ResponseCache } from "./cache";
import type { Clock } from "./clock";
import type { Middleware, RequestContext, StreamHook } from "./context";
import { GatewayError } from "./errors";
import { redact, StreamRestorer, Vault, type PiiType } from "./redact";
import { shortName, type Resilience } from "./resilience";
import { buildChain, modelInfo, requestedTier } from "./routing";
import { FLAG_NOTE, screen } from "./screen";
import { hashString } from "./rng";
import { costUsd, estimateMessages, estimateTokens } from "./tokens";
import { tierRank, type AttemptRecord, type ModelInfo, type StreamEvent, type TenantConfig, type Upstream } from "./types";

export interface TenantState {
  rpm: TokenBucket;
  tpm: TokenBucket;
  windowStart: number;
  spentUsd: number;
}

export interface GatewayInternals {
  clock: Clock;
  catalog: readonly ModelInfo[];
  upstreams: () => readonly Upstream[];
  cache: ResponseCache;
  resilience: Resilience;
  tenantByKey(key: string): TenantConfig | null;
  tenantState(t: TenantConfig): TenantState;
  /** Rolls the budget window forward if it has ended. */
  budgetWindow(t: TenantConfig, st: TenantState): void;
  onAttempt(ctx: RequestContext, rec: AttemptRecord, phase: "start" | "end"): void;
}

/** Added to the system prompt when reversible redaction replaced something. */
export const PLACEHOLDER_NOTE = "Some values in the user's messages were replaced with placeholders such as <EMAIL_1> or <PHONE_1>. Write a placeholder exactly as it appears whenever you refer to that value.";

const fmtUsd = (v: number) => (v >= 0.01 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`);
const lastUser = (ctx: RequestContext) => [...ctx.messages].reverse().find((m) => m.role === "user")?.content ?? "";

export function createChain(gw: GatewayInternals): Middleware[] {
  const audit: Middleware = {
    stage: "audit",
    // The record itself is written by the gateway when the request ends (an `end` hook
    // registered here would run last anyway); this stage only marks the request.
    handle: (ctx, next) => next(ctx),
  };

  const auth: Middleware = {
    stage: "auth",
    async handle(ctx, next) {
      const t = ctx.req.apiKey ? gw.tenantByKey(ctx.req.apiKey) : null;
      if (!t) {
        ctx.decide("auth", "bad", ctx.req.apiKey ? "unknown key" : "no key");
        throw new GatewayError(401, "authentication_error", "invalid x-api-key");
      }
      ctx.tenant = t;
      ctx.decide("auth", "ok", t.name);
      return next(ctx);
    },
  };

  const limit: Middleware = {
    stage: "limit",
    async handle(ctx, next) {
      const t = ctx.tenant!;
      const st = gw.tenantState(t);
      const now = gw.clock.now();
      const r = st.rpm.take(1, now);
      if (!r.ok) {
        ctx.decide("limit", "bad", "429 · requests/min", `retry in ${Math.ceil(r.retryAfterMs)} ms`);
        throw new GatewayError(429, "rate_limit_error", `request rate limit of ${t.limits.requestsPerMinute}/min reached`, {
          "retry-after": String(Math.max(1, Math.ceil(r.retryAfterMs / 1000))),
          "x-ratelimit-limit-requests": String(t.limits.requestsPerMinute),
          "x-ratelimit-remaining-requests": "0",
        });
      }
      // Reserve the prompt plus a typical answer now; settle with the real count at the end.
      const reserve = estimateMessages(ctx.req.system, ctx.req.messages) + Math.min(ctx.req.maxTokens, 512);
      const tr = st.tpm.take(reserve, now);
      if (!tr.ok) {
        st.rpm.settle(-1, now);
        ctx.decide("limit", "bad", "429 · tokens/min", `${reserve} tokens do not fit`);
        throw new GatewayError(429, "rate_limit_error", `token rate limit of ${t.limits.tokensPerMinute}/min reached`, {
          "retry-after": String(Number.isFinite(tr.retryAfterMs) ? Math.max(1, Math.ceil(tr.retryAfterMs / 1000)) : 60),
          "x-ratelimit-limit-tokens": String(t.limits.tokensPerMinute),
          "x-ratelimit-remaining-tokens": String(Math.max(0, Math.floor(tr.remaining))),
        });
      }
      ctx.headers["x-ratelimit-remaining-requests"] = String(Math.floor(r.remaining));
      ctx.headers["x-ratelimit-remaining-tokens"] = String(Math.floor(tr.remaining));
      ctx.decide("limit", "ok", `${Math.floor(r.remaining)}/${t.limits.requestsPerMinute} rpm left`);
      ctx.hooks.push({
        stage: "limit",
        end(c) {
          const used = c.cache.kind === "exact" || c.cache.kind === "near" ? 0 : c.usage.inputTokens + c.usage.outputTokens;
          st.tpm.settle(used - reserve, gw.clock.now());
        },
      });
      return next(ctx);
    },
  };

  const redactStage: Middleware = {
    stage: "redact",
    async handle(ctx, next) {
      const mode = ctx.tenant!.redaction;
      // The audit copy is always redacted, even when the tenant sends raw text upstream.
      const vault = mode === "reversible" ? ctx.vault : new Vault();
      const counts: Partial<Record<PiiType, number>> = {};
      const red = (s: string) => {
        const r = redact(s, vault, mode === "mask" ? "mask" : "reversible");
        for (const f of r.findings) counts[f.type] = (counts[f.type] ?? 0) + 1;
        return r.text;
      };
      const messages = ctx.messages.map((m) => ({ role: m.role, content: red(m.content) }));
      const system = ctx.system !== undefined ? red(ctx.system) : undefined;
      ctx.redaction = counts;
      ctx.auditPrompt = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      if (mode !== "off") {
        ctx.messages = messages;
        ctx.system = system;
      }
      const n = Object.values(counts).reduce((a, b) => a + b, 0);
      if (n === 0) ctx.decide("redact", "ok", "no PII found");
      else if (mode === "off") ctx.decide("redact", "warn", `${n} PII · redaction off`, "sent upstream as is; the audit log keeps the redacted copy");
      else
        ctx.decide(
          "redact",
          "info",
          `${n} → placeholders`,
          mode === "reversible"
            ? vault.tokens().join(" ")
            : Object.keys(counts)
                .map((k) => `[${k}]`)
                .join(" ") + " (one-way)",
        );

      const restorer = mode === "reversible" && vault.size > 0 ? new StreamRestorer(vault) : null;
      ctx.hooks.push({
        stage: "redact",
        event(ev) {
          if (ev.type === "text") {
            ctx.upstreamText += ev.text;
            if (!restorer) return undefined;
            const out = restorer.push(ev.text);
            return out ? [{ type: "text", text: out }] : [];
          }
          if ((ev.type === "stop" || ev.type === "error") && restorer) {
            const tail = restorer.flush();
            return tail ? [{ type: "text", text: tail }, ev] : undefined;
          }
          return undefined;
        },
        end() {
          if (restorer && restorer.restored) ctx.decide("redact", "ok", `restored ${restorer.restored}`, restorer.split ? `${restorer.split} placeholder${restorer.split > 1 ? "s" : ""} arrived split across chunks` : undefined);
        },
      });
      return next(ctx);
    },
  };

  const screenStage: Middleware = {
    stage: "screen",
    async handle(ctx, next) {
      const t = ctx.tenant!;
      const text = ctx.messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n");
      const r = screen(text, t.screen);
      ctx.screen = r;
      const why = r.signals.map((s) => s.label).join(", ");
      if (r.verdict === "block") {
        ctx.decide("screen", "bad", `blocked · ${r.score.toFixed(2)}`, why);
        throw new GatewayError(400, "invalid_request_error", `blocked by the prompt-injection screen (score ${r.score.toFixed(2)}: ${why})`);
      }
      if (r.verdict === "flag") {
        ctx.flagged = true;
        ctx.decide("screen", "warn", `flagged · ${r.score.toFixed(2)}`, `${why}; guard note added to the system prompt`);
      } else ctx.decide("screen", "ok", `clean · ${r.score.toFixed(2)}`, why || undefined);
      return next(ctx);
    },
  };

  const cacheStage: Middleware = {
    stage: "cache",
    async handle(ctx, next) {
      const t = ctx.tenant!;
      if (!t.cache) {
        ctx.cache = { kind: "bypass" };
        ctx.decide("cache", "info", "cache off");
        return next(ctx);
      }
      const now = gw.clock.now();
      // Scoped by config version too: an answer produced under one config is not evidence
      // about another, and a canary must be judged on its own answers.
      const scope = `${t.id}|${ctx.config.version}|${ctx.req.model}|${ctx.req.maxTokens}|${hashString(ctx.config.systemPrompt + "\0" + (ctx.system ?? ""))}|${ctx.flagged ? 1 : 0}`;
      const key = JSON.stringify(ctx.messages.map((m) => [m.role, m.content.trim().replace(/\s+/g, " ")]));
      const prompt = ctx.messages.length === 1 ? ctx.messages[0].content : null;
      const res = gw.cache.lookup(scope, key, prompt, now, t.cache.near ? { threshold: t.cache.threshold } : null);
      if (res.kind !== "miss" && res.response) {
        const hit = res.response;
        ctx.cache = { kind: res.kind, similarity: res.similarity, savedUsd: hit.costUsd };
        ctx.usage.model = hit.model;
        ctx.decide("cache", "ok", res.kind === "exact" ? "exact hit" : `near hit · ${res.similarity!.toFixed(2)}`, `saved ${fmtUsd(hit.costUsd)}; entry ${Math.round((res.ageMs ?? 0) / 1000)} s old`);
        ctx.headers["x-relay-cache"] = res.kind;
        return { source: replay(hit.text, hit.model, hit.inputTokens, hit.outputTokens), sourceStage: "cache" };
      }
      ctx.cache = { kind: "miss", rejected: res.rejected ? `${res.rejected.reason} (${res.rejected.similarity.toFixed(2)})` : undefined };
      ctx.headers["x-relay-cache"] = "miss";
      ctx.decide("cache", "info", "miss", res.rejected ? `nearest ${res.rejected.similarity.toFixed(2)} rejected: ${res.rejected.reason}` : undefined);
      ctx.hooks.push({
        stage: "cache",
        end(c, outcome) {
          // Only complete, natural answers are worth replaying.
          if (outcome !== "ok" || c.usage.stopReason !== "end_turn" || !c.upstreamText) return;
          gw.cache.store(scope, key, prompt, { text: c.upstreamText, model: c.usage.model ?? "", inputTokens: c.usage.inputTokens, outputTokens: c.usage.outputTokens, costUsd: c.usage.costUsd }, gw.clock.now(), t.cache!.ttlMs, res.probe);
        },
      });
      return next(ctx);
    },
  };

  const route: Middleware = {
    stage: "route",
    async handle(ctx, next) {
      const t = ctx.tenant!;
      const rt = requestedTier(ctx.req.model, lastUser(ctx), ctx.config, gw.catalog);
      if (!rt) {
        ctx.decide("route", "bad", "unknown model", ctx.req.model);
        throw new GatewayError(404, "not_found_error", `model ${ctx.req.model} is not served by this gateway`);
      }
      if (tierRank(rt.tier) > tierRank(t.maxTier) && ctx.req.model === "relay-auto") {
        // "auto" lets the gateway choose, so it chooses within what the tenant may use.
        rt.reason = `${rt.reason}, capped at ${t.maxTier} for ${t.name}`;
        rt.tier = t.maxTier;
      }
      if (tierRank(rt.tier) > tierRank(t.maxTier)) {
        ctx.decide("route", "bad", `${rt.tier} not allowed`, `${t.name} is capped at ${t.maxTier}`);
        throw new GatewayError(403, "permission_error", `tier ${rt.tier} is above this tenant's limit (${t.maxTier})`);
      }
      const chain = buildChain(rt.tier, gw.upstreams(), gw.catalog, rt.pinned);
      if (!chain.length) throw new GatewayError(503, "api_error", `no upstream serves tier ${rt.tier}`);
      ctx.route = { tier: rt.tier, reason: rt.reason, chain: chain.map((u) => u.id) };
      ctx.decide("route", "ok", `${rt.tier} → ${shortName(chain[0])}`, `${rt.reason}; fallback chain: ${chain.map(shortName).join(" → ")}`);
      return next(ctx);
    },
  };

  const meter: Middleware = {
    stage: "meter",
    async handle(ctx, next) {
      const t = ctx.tenant!;
      const st = gw.tenantState(t);
      gw.budgetWindow(t, st);
      if (st.spentUsd >= t.budgetUsd) {
        const resetIn = Math.max(0, st.windowStart + t.budgetWindowMs - gw.clock.now());
        ctx.decide("meter", "bad", "budget spent", `${fmtUsd(st.spentUsd)} of ${fmtUsd(t.budgetUsd)}; resets in ${Math.ceil(resetIn / 1000)} s`);
        throw new GatewayError(402, "billing_error", `budget of ${fmtUsd(t.budgetUsd)} per ${Math.round(t.budgetWindowMs / 60000)} min is spent`, {
          "retry-after": String(Math.max(1, Math.ceil(resetIn / 1000))),
        });
      }
      let price: ModelInfo | undefined;
      let estOut = 0;
      const charge = (usd: number) => {
        ctx.usage.costUsd += usd;
        st.spentUsd += usd;
      };
      const setOutput = (tokens: number) => {
        if (price) charge(costUsd(0, tokens - ctx.usage.outputTokens, price));
        ctx.usage.outputTokens = tokens;
      };
      const hook: StreamHook = {
        stage: "meter",
        event(ev) {
          switch (ev.type) {
            case "start":
              price = modelInfo(ev.model, gw.catalog) ?? modelInfo(ctx.route?.model ?? "", gw.catalog);
              ctx.usage.model = ev.model;
              ctx.usage.inputTokens = ev.inputTokens;
              if (price) charge(costUsd(ev.inputTokens, 0, price));
              return undefined;
            case "text": {
              // Anthropic reports output tokens only at the end, so meter an estimate as text arrives.
              estOut += estimateTokens(ev.text);
              ctx.usage.estimated = true;
              setOutput(Math.max(ctx.usage.outputTokens, estOut));
              if (st.spentUsd > t.budgetUsd && !ctx.cut) {
                ctx.cut = "budget";
                ctx.decide("meter", "bad", `cut at ${ctx.usage.outputTokens} tokens`, `tenant budget ${fmtUsd(t.budgetUsd)} ran out mid-stream`);
                return [ev, { type: "error", error: { type: "budget_exceeded_error", message: `tenant budget of ${fmtUsd(t.budgetUsd)} ran out after ${ctx.usage.outputTokens} output tokens` } }];
              }
              return undefined;
            }
            case "usage":
              ctx.usage.estimated = false;
              setOutput(ev.outputTokens);
              return undefined;
            case "stop":
              ctx.usage.estimated = false;
              ctx.usage.stopReason = ev.reason;
              setOutput(ev.outputTokens);
              return undefined;
            default:
              return undefined;
          }
        },
        end(c) {
          // Attempts that were accepted upstream but lost (hedges, drops before the
          // first token) still consumed input tokens.
          for (const a of c.attempts) {
            if (a.outcome === "won" || !a.inputTokens) continue;
            const p = modelInfo(gw.upstreams().find((u) => u.id === a.upstream)?.model ?? "", gw.catalog);
            if (p) {
              const w = costUsd(a.inputTokens, 0, p);
              c.usage.wastedUsd += w;
              charge(w);
            }
          }
          if (c.usage.inputTokens || c.usage.outputTokens)
            c.decide("meter", c.cut ? "bad" : "ok", `${c.usage.inputTokens}+${c.usage.outputTokens} tok · ${fmtUsd(c.usage.costUsd)}`, c.usage.wastedUsd ? `includes ${fmtUsd(c.usage.wastedUsd)} for cancelled attempts` : undefined);
        },
      };
      ctx.hooks.push(hook);
      return next(ctx);
    },
  };

  const resilience: Middleware = {
    stage: "resilience",
    async handle(ctx) {
      const notes = [ctx.config.systemPrompt];
      if (ctx.vault.size) notes.push(PLACEHOLDER_NOTE);
      if (ctx.flagged) notes.push(FLAG_NOTE);
      if (ctx.system) notes.push(ctx.system);
      const sink = {
        signal: ctx.signal,
        attempts: ctx.attempts,
        decide: (tone: Parameters<RequestContext["decide"]>[1], label: string, detail?: string) => ctx.decide("resilience", tone, label, detail),
        onAttempt: (rec: AttemptRecord, phase: "start" | "end") => gw.onAttempt(ctx, rec, phase),
        get waitUs() {
          return ctx.waitUs;
        },
        set waitUs(v: number) {
          ctx.waitUs = v;
        },
      };
      const chain = ctx.route!.chain.map((id) => gw.upstreams().find((u) => u.id === id)!);
      const c = await gw.resilience.call(sink, chain, { system: notes.filter(Boolean).join("\n\n"), messages: ctx.messages, maxTokens: ctx.req.maxTokens }, ctx.config.resilience);
      ctx.route!.upstream = c.upstream.id;
      ctx.route!.model = c.upstream.model;
      ctx.headers["x-relay-upstream"] = c.upstream.id;
      return { source: c.events, sourceStage: "resilience" };
    },
  };

  return [audit, auth, limit, redactStage, screenStage, cacheStage, route, meter, resilience];
}

/** Replays a cached answer as a stream, in chunks of a few words. */
async function* replay(text: string, model: string, inputTokens: number, outputTokens: number): AsyncGenerator<StreamEvent> {
  yield { type: "start", model, inputTokens };
  const parts = text.match(/\s*\S+(?:\s+\S+){0,3}/g) ?? [text];
  for (const p of parts) yield { type: "text", text: p };
  yield { type: "stop", reason: "end_turn", outputTokens };
}
