// The audit log: one record per request, written after it ends, holding only
// redacted text. Records are hash-chained (each carries the SHA-256 of the
// previous record and of itself), so editing or deleting a record in an export
// breaks verification from that point on.

import { sha256 } from "./sha256";
import type { PiiType } from "./redact";

export interface AuditRecord {
  seq: number;
  id: string;
  /** Wall-clock time, ISO 8601. */
  time: string;
  tenant: string | null;
  configVersion: string;
  model: string;
  route: { tier: string; upstream: string | null; model: string | null } | null;
  status: number;
  outcome: "ok" | "cut" | "error" | "rejected" | "cancelled";
  error?: string;
  redaction: Partial<Record<PiiType, number>>;
  screen: { score: number; verdict: string; signals: string[] } | null;
  cache: string;
  attempts: { upstream: string; kind: string; outcome?: string; error?: string; ttfbMs?: number }[];
  usage: { inputTokens: number; outputTokens: number; costUsd: number; wastedUsd: number; estimated: boolean };
  latencyMs: number;
  ttfbMs: number | null;
  /** Redacted, at most 400 characters. */
  prompt: string;
  /** Redacted, at most 400 characters. */
  response: string;
  prev: string;
  hash: string;
}

export const GENESIS = "0".repeat(64);
const clip = (s: string, n = 400) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const o = v as Record<string, unknown>;
  return (
    "{" +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonical(o[k]))
      .join(",") +
    "}"
  );
}

export const recordHash = (r: Omit<AuditRecord, "hash">): string => sha256(r.prev + "\n" + canonical({ ...r, prev: undefined }));

export class AuditLog {
  private records: AuditRecord[] = [];
  private seq = 0;
  private head = GENESIS;
  /** The `prev` of the oldest record still held (GENESIS until the ring wraps). */
  anchor = GENESIS;

  constructor(readonly capacity = 1000) {}

  append(r: Omit<AuditRecord, "seq" | "prev" | "hash" | "prompt" | "response"> & { prompt: string; response: string }): AuditRecord {
    const body: Omit<AuditRecord, "hash"> = { ...r, seq: ++this.seq, prompt: clip(r.prompt), response: clip(r.response), prev: this.head };
    const rec: AuditRecord = { ...body, hash: recordHash(body) };
    this.head = rec.hash;
    this.records.push(rec);
    if (this.records.length > this.capacity) this.anchor = this.records.shift()!.hash;
    return rec;
  }

  list(opts: { tenant?: string; limit?: number } = {}): AuditRecord[] {
    const xs = opts.tenant ? this.records.filter((r) => r.tenant === opts.tenant) : this.records;
    return xs.slice(-(opts.limit ?? xs.length));
  }

  get size(): number {
    return this.records.length;
  }

  verify(): { ok: boolean; checked: number; brokenAt?: number } {
    return verifyChain(this.records, this.anchor);
  }
}

export function verifyChain(records: readonly AuditRecord[], anchor = GENESIS): { ok: boolean; checked: number; brokenAt?: number } {
  let prev = anchor;
  for (let i = 0; i < records.length; i++) {
    const { hash, ...body } = records[i];
    if (body.prev !== prev || recordHash(body) !== hash) return { ok: false, checked: i, brokenAt: records[i].seq };
    prev = hash;
  }
  return { ok: true, checked: records.length };
}
