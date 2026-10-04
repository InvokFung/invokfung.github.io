import type { AbortSignalLike } from "./platform";
import type { PiiType, Vault } from "./redact";
import type { ScreenResult } from "./screen";
import type { AttemptRecord, ChatMessage, Decision, GatewayConfig, RelayRequest, Stage, StreamEvent, TenantConfig, Tier, Tone, Trace } from "./types";

export type Outcome = "ok" | "cut" | "error" | "rejected" | "cancelled";

/**
 * Stream-phase work a middleware registers while handling the request. The
 * gateway runs `event` hooks innermost first on every event of the response
 * (each may pass, rewrite, drop or add events), and every `end` hook once the
 * request is over, however it ended. Both are synchronous, so their cost is
 * measured exactly.
 */
export interface StreamHook {
  stage: Stage;
  /** Return undefined to pass the event through unchanged. */
  event?(ev: StreamEvent, ctx: RequestContext): StreamEvent[] | undefined;
  end?(ctx: RequestContext, outcome: Outcome): void;
}

export interface Reply {
  source: AsyncGenerator<StreamEvent>;
  /** Which stage produced the stream: the cache (a replay) or resilience (an upstream). */
  sourceStage: Stage;
}

export type Next = (ctx: RequestContext) => Promise<Reply>;

export interface Middleware {
  stage: Stage;
  handle(ctx: RequestContext, next: Next): Promise<Reply>;
}

export interface RequestContext {
  readonly id: string;
  readonly req: RelayRequest;
  readonly config: GatewayConfig;
  readonly canary: boolean;
  readonly startedAt: number;
  readonly signal: AbortSignalLike;
  tenant: TenantConfig | null;
  /** Messages as they will be sent upstream (redacted unless the tenant turned redaction off). */
  messages: ChatMessage[];
  /** The request's own system prompt, redacted the same way. */
  system: string | undefined;
  vault: Vault;
  redaction: Partial<Record<PiiType, number>>;
  /** The prompt as the audit log stores it: always redacted. */
  auditPrompt: string;
  /** The response as the upstream or cache produced it (placeholders, not values). */
  upstreamText: string;
  screen: ScreenResult | null;
  flagged: boolean;
  cache: { kind: "exact" | "near" | "miss" | "bypass"; similarity?: number; rejected?: string; savedUsd?: number };
  route: { tier: Tier; reason: string; chain: string[]; upstream?: string; model?: string } | null;
  attempts: AttemptRecord[];
  usage: { model?: string; inputTokens: number; outputTokens: number; costUsd: number; wastedUsd: number; estimated: boolean; stopReason?: string };
  cut: string | null;
  headers: Record<string, string>;
  hooks: StreamHook[];
  decisions: Decision[];
  /** Self time per stage, microseconds. */
  us: Record<Stage, number>;
  /** Microseconds spent waiting on upstreams and timers. */
  waitUs: number;
  firstTextAt: number | null;
  decide(stage: Stage, tone: Tone, label: string, detail?: string): void;
}

export interface RequestSummary {
  id: string;
  tenant: string | null;
  configVersion: string;
  canary: boolean;
  model: string;
  status: number;
  outcome: Outcome;
  error?: string;
  cache: RequestContext["cache"]["kind"];
  similarity?: number;
  tier?: Tier;
  upstream?: string;
  servedModel?: string;
  attempts: number;
  retries: number;
  hedged: boolean;
  hedgeWon: boolean;
  fellBack: boolean;
  latencyMs: number;
  ttfbMs: number | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  savedUsd: number;
  wastedUsd: number;
  redactions: number;
  screenScore: number | null;
  verdict: string | null;
  trace: Trace;
  decisions: Decision[];
  startedAt: number;
  endedAt: number;
}
