import type { ServerMessage } from "@arena/protocol";

/**
 * Everything the arena needs from its host, injected so the same code runs in Node
 * (behind WebSockets), in a browser Web Worker (behind postMessage) and in tests
 * (behind a manual clock). The core package is compiled without DOM or Node types,
 * so it cannot reach for a global by accident.
 */

export interface Scheduler {
  /** Wall clock, ms since epoch: stamped into events. */
  now(): number;
  /** Monotonic high-resolution ms, for measuring durations. */
  monotonic(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RandomSource {
  /** Cryptographically strong random bytes (seeds, ids, tokens). */
  bytes(n: number): Uint8Array;
}

/** Issues and verifies the resume token a client keeps to reclaim its identity. */
export interface SessionAuthority {
  issue(playerId: string): string;
  verify(token: string): string | null;
}

/** A message plus its JSON encoding, computed at most once however many sockets it goes to. */
export interface Frame {
  readonly message: ServerMessage;
  readonly json: string;
}

export function frame(message: ServerMessage): Frame {
  let json: string | undefined;
  return {
    message,
    get json() {
      return (json ??= JSON.stringify(message));
    },
  };
}

export interface Connection {
  readonly id: string;
  send(frame: Frame): void;
  close(code: number, reason: string): void;
}

export interface Logger {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

/** Trusts `local.<playerId>` tokens. Only for the in-browser arena, where the player owns the "server". */
export class LocalSessions implements SessionAuthority {
  issue(playerId: string): string {
    return `local.${playerId}`;
  }
  verify(token: string): string | null {
    const m = /^local\.([a-z]_[a-z0-9]{6,32})$/.exec(token);
    return m ? (m[1] as string) : null;
  }
}
