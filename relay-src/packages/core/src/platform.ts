// The only web-platform APIs the core touches. Every one of them exists in
// browsers and in Node 18+, so the same gateway code runs in a tab, in a worker,
// in the Node server and in tests. Core compiles against ES2022 with no DOM and
// no Node typings; this file is the single, reviewable boundary.

export interface AbortSignalLike {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

export interface AbortControllerLike {
  readonly signal: AbortSignalLike;
  abort(reason?: unknown): void;
}

export interface TextDecoderLike {
  decode(input?: Uint8Array, options?: { stream?: boolean }): string;
}

/** The subset of a fetch Response the Anthropic upstream reads. */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(reason?: unknown): Promise<void> } } | null;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignalLike },
) => Promise<FetchResponseLike>;

interface Globals {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  setImmediate?: (fn: () => void) => unknown;
  MessageChannel?: new () => { port1: { onmessage: (() => void) | null; close(): void }; port2: { postMessage(v: unknown): void; close(): void } };
  performance?: { now(): number };
  AbortController: new () => AbortControllerLike;
  TextDecoder: new () => TextDecoderLike;
  TextEncoder?: new () => { encode(s: string): Uint8Array };
}

const g = globalThis as unknown as Globals;

export const setTimer = (fn: () => void, ms: number): unknown => g.setTimeout(fn, ms);
export const clearTimer = (id: unknown): void => g.clearTimeout(id);
export const newAbortController = (): AbortControllerLike => new g.AbortController();
export const newTextDecoder = (): TextDecoderLike => new g.TextDecoder();
const encoder = g.TextEncoder ? new g.TextEncoder() : null;
/** UTF-8 bytes of a string (null where the host has no TextEncoder). */
export const encodeUtf8 = (s: string): Uint8Array | null => (encoder ? encoder.encode(s) : null);

/** Monotonic milliseconds with sub-millisecond resolution where the host offers it. */
export const hrnow: () => number = g.performance ? () => g.performance!.now() : () => Date.now();

/** Resolves on the next macrotask, after every pending promise job has run. */
export const macrotask: () => Promise<void> = (() => {
  if (g.setImmediate) return () => new Promise<void>((r) => void g.setImmediate!(r));
  if (g.MessageChannel) {
    const ch = new g.MessageChannel();
    const queue: (() => void)[] = [];
    ch.port1.onmessage = () => queue.shift()?.();
    return () =>
      new Promise<void>((r) => {
        queue.push(r);
        ch.port2.postMessage(0);
      });
  }
  return () => new Promise<void>((r) => void g.setTimeout(r, 0));
})();
