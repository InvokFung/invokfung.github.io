import type { AbortSignalLike } from "./platform";

export type Tier = "fast" | "balanced" | "best";
export const TIERS: readonly Tier[] = ["fast", "balanced", "best"];
export const tierRank = (t: Tier): number => TIERS.indexOf(t) + 1;

/** The middleware chain, in the order a request meets it. */
export type Stage = "auth" | "limit" | "redact" | "screen" | "cache" | "route" | "resilience" | "meter" | "audit";
export const STAGES: readonly Stage[] = ["auth", "limit", "redact", "screen", "cache", "route", "resilience", "meter", "audit"];

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** What a client sends: the text subset of an Anthropic Messages request plus the tenant key. */
export interface RelayRequest {
  apiKey: string;
  /** "relay-auto", "relay-fast", "relay-balanced", "relay-best", or a concrete model id. */
  model: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens: number;
  stream?: boolean;
  id?: string;
  /** Pins the config version (the canary splitter sets this; tests and evals may too). */
  configVersion?: string;
}

export type StopReason = "end_turn" | "max_tokens" | "stop_sequence" | "refusal" | "tool_use" | "pause_turn" | (string & {});

export interface ApiError {
  type: string;
  message: string;
}

/** The gateway's internal stream. Upstreams translate into it; the server translates out of it into Anthropic SSE. */
export type StreamEvent =
  | { type: "start"; model: string; inputTokens: number }
  | { type: "text"; text: string }
  /** Authoritative cumulative output tokens, when the upstream reports them mid-stream. */
  | { type: "usage"; outputTokens: number }
  | { type: "stop"; reason: StopReason; outputTokens: number }
  | { type: "error"; error: ApiError };

export interface UpstreamCall {
  model: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens: number;
  signal: AbortSignalLike;
}

export interface Upstream {
  /** Unique deployment id, e.g. "us-east/claude-sonnet-5-5". */
  readonly id: string;
  readonly model: string;
  readonly region: string;
  readonly kind: "simulator" | "anthropic";
  /**
   * Starts a call. Rejects with UpstreamError when the upstream refuses (an HTTP error).
   * The stream throws UpstreamError when it fails part-way. Aborting `call.signal` stops generation.
   */
  open(call: UpstreamCall): Promise<AsyncIterable<StreamEvent>>;
}

export interface ModelInfo {
  id: string;
  label: string;
  tier: Tier;
  /** USD per million tokens. */
  inputPerMTok: number;
  outputPerMTok: number;
  /** output_config.effort sent on real API calls; thinking tokens count against max_tokens. */
  effort?: "low" | "medium" | "high";
}

export type RedactionMode = "reversible" | "mask" | "off";

export interface TenantConfig {
  id: string;
  name: string;
  keys: string[];
  limits: { requestsPerMinute: number; tokensPerMinute: number };
  /** Spend allowed per budget window, in USD. */
  budgetUsd: number;
  budgetWindowMs: number;
  cache: { ttlMs: number; near: boolean; threshold: number } | null;
  redaction: RedactionMode;
  screen: { flag: number; block: number };
  maxTier: Tier;
}

export interface BreakerConfig {
  /** Outcomes kept in the rolling window. */
  window: number;
  minRequests: number;
  /** Trip when the 95% lower bound of the window's failure share reaches this. */
  failureRate: number;
  cooldownMs: number;
  maxCooldownMs: number;
  /** Consecutive probe successes needed to close again. */
  probes: number;
}

export interface ResilienceConfig {
  /** Total attempts, the first included. 1 means no retries. */
  maxAttempts: number;
  /** Attempts on one upstream before moving down the fallback chain. */
  attemptsPerUpstream: number;
  fallback: boolean;
  breaker: boolean;
  backoff: { baseMs: number; capMs: number };
  firstTokenTimeoutMs: number;
  idleTimeoutMs: number;
  deadlineMs: number;
  /** Hedge once the first token is later than this quantile of the upstream's recent first-token times. */
  hedge: { quantile: number; minSamples: number; floorMs: number } | null;
}

/** Everything a canary can change. Requests carry the version they ran under. */
export interface GatewayConfig {
  version: string;
  label: string;
  note?: string;
  systemPrompt: string;
  routing: { classifier: "standard" | "cost-cut" };
  resilience: ResilienceConfig;
}

export type Tone = "ok" | "info" | "warn" | "bad";

export interface Decision {
  stage: Stage;
  tone: Tone;
  label: string;
  detail?: string;
  /** Milliseconds since the request started (gateway clock). */
  at: number;
}

export interface Trace {
  /** Self time per stage in microseconds, request phase plus stream phase. */
  stages: Record<Stage, number>;
  /** Microseconds of CPU spent inside upstream code (the simulator, or SSE parsing for a real upstream). */
  upstreamUs: number;
  /** Microseconds of CPU spent in the gateway call, upstream included, waiting excluded. */
  totalUs: number;
}

export interface AttemptRecord {
  n: number;
  upstream: string;
  kind: "primary" | "retry" | "fallback" | "hedge";
  startedAt: number;
  endedAt?: number;
  outcome?: "won" | "failed" | "cancelled";
  error?: string;
  ttfbMs?: number;
  inputTokens?: number;
}
