import { hostname } from "node:os";

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly store: { readonly kind: "memory" } | { readonly kind: "file"; readonly path: string; readonly fsync: boolean } | { readonly kind: "mongo"; readonly url: string; readonly db: string };
  /** HMAC key for resume tokens; shared by every replica so any of them can verify a token. */
  readonly sessionSecret: string | null;
  /** Browser origins allowed to open a socket; empty = any (development). */
  readonly allowedOrigins: readonly string[];
  readonly instance: string;
  readonly fillAfterMs: number;
  readonly botFillAfterMs: number | null;
  /** On SIGTERM: report not-ready for this long before closing, so the load balancer drains us first. */
  readonly drainMs: number;
  readonly logLevel: "debug" | "info" | "warn" | "error";
}

type Env = Readonly<Record<string, string | undefined>>;

export function loadConfig(env: Env = process.env): ServerConfig {
  const storeKind = env.ARENA_STORE ?? "memory";
  const store: ServerConfig["store"] =
    storeKind === "memory"
      ? { kind: "memory" }
      : storeKind === "file"
        ? { kind: "file", path: env.ARENA_FILE ?? "./data/events.jsonl", fsync: env.ARENA_FILE_FSYNC === "1" }
        : storeKind === "mongo"
          ? { kind: "mongo", url: required(env, "ARENA_MONGO_URL"), db: env.ARENA_MONGO_DB ?? "triplefind_arena" }
          : fail(`ARENA_STORE must be memory, file or mongo (got "${storeKind}")`);
  const botFill = env.ARENA_BOT_FILL_MS ?? "8000";
  const logLevel = env.LOG_LEVEL ?? "info";
  if (!["debug", "info", "warn", "error"].includes(logLevel)) fail(`LOG_LEVEL must be debug, info, warn or error`);
  return {
    host: env.HOST ?? "0.0.0.0",
    port: int(env, "PORT", 8782, 0, 65535),
    store,
    sessionSecret: env.ARENA_SESSION_SECRET && env.ARENA_SESSION_SECRET.length > 0 ? env.ARENA_SESSION_SECRET : null,
    allowedOrigins: (env.ARENA_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    instance: env.ARENA_INSTANCE ?? env.HOSTNAME ?? hostname(),
    fillAfterMs: int(env, "ARENA_FILL_MS", 3000, 0, 600_000),
    botFillAfterMs: botFill === "off" ? null : int(env, "ARENA_BOT_FILL_MS", 8000, 0, 600_000),
    drainMs: int(env, "ARENA_DRAIN_MS", 0, 0, 120_000),
    logLevel: logLevel as ServerConfig["logLevel"],
  };
}

function int(env: Env, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) fail(`${key} must be an integer in ${min}..${max} (got "${raw}")`);
  return n;
}

function required(env: Env, key: string): string {
  const v = env[key];
  if (!v) fail(`${key} is required`);
  return v;
}

function fail(message: string): never {
  throw new Error(`config: ${message}`);
}
