/** An error the gateway returns to its client, shaped like an Anthropic API error. */
export class GatewayError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "GatewayError";
  }

  toJSON() {
    return { type: "error", error: { type: this.type, message: this.message } };
  }
}

export type UpstreamFailure = "http" | "timeout" | "stalled" | "dropped" | "network";

/** A failed upstream attempt. `retryable` decides whether resilience tries again. */
export class UpstreamError extends Error {
  constructor(
    readonly kind: UpstreamFailure,
    readonly status: number,
    readonly errorType: string,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }

  get retryable(): boolean {
    if (this.kind !== "http") return true;
    return this.status === 408 || this.status === 409 || this.status === 429 || this.status >= 500;
  }

  /** Short label for traces: "529", "timeout", "dropped"… */
  get short(): string {
    return this.kind === "http" ? String(this.status) : this.kind;
  }
}

/** Maps an Anthropic error type to its HTTP status. */
export function statusForErrorType(type: string): number {
  switch (type) {
    case "invalid_request_error":
      return 400;
    case "authentication_error":
      return 401;
    case "billing_error":
      return 402;
    case "permission_error":
      return 403;
    case "not_found_error":
      return 404;
    case "request_too_large":
      return 413;
    case "rate_limit_error":
      return 429;
    case "overloaded_error":
      return 529;
    default:
      return 500;
  }
}
