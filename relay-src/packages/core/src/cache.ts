// Response cache: an exact map plus a near-duplicate index, scoped per tenant.
//
// Entries hold the response in its redacted form (placeholders, not values),
// so the cache never stores PII, and an exact hit for "refund to <EMAIL_1>" is
// restored with the email of whoever asked this time.
//
// The near index is MinHash with LSH banding (the default) or SimHash with a
// Hamming-distance scan (kept for the benchmark's comparison). LSH buckets are
// split by the guard's anchor (the prompt's numbers and placeholders), because
// the guard rejects any candidate whose anchor differs: a crowd of "refund order
// N" entries then costs one map lookup instead of a scan.

import { guardKey, guardKeys, hamming, lshKeys, minhash, minhashSimilarity, normalizePrompt, shingles, simhash, type GuardKey } from "./similarity";

export interface CachedResponse {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** What a prompt hashes to, computed once at lookup and reused by store. */
export interface Probe {
  prompt: string;
  gk: GuardKey;
  sig: Uint32Array | null;
  sim: [number, number] | null;
  bands: string[];
}

interface Entry extends CachedResponse {
  key: string;
  scope: string;
  createdAt: number;
  expiresAt: number;
  hits: number;
  probe: Probe | null;
  bandKeys: string[];
}

export interface CacheLookup {
  kind: "exact" | "near" | "miss";
  response?: CachedResponse;
  similarity?: number;
  /** For a miss: the best candidate that was turned down, and why. */
  rejected?: { similarity: number; reason: string };
  /** For a near hit: how old the entry is. */
  ageMs?: number;
  /** Pass back to store() to skip hashing the prompt twice. */
  probe?: Probe;
}

export interface NearOptions {
  /** MinHash: smallest estimated Jaccard similarity that counts as near. */
  threshold: number;
  /** Off only to measure what the guard is worth. */
  guard?: boolean;
  /** SimHash: largest Hamming distance (of 64 bits) that counts as near. */
  maxHamming?: number;
}

export type NearIndex = "minhash" | "simhash";

export class ResponseCache {
  private exact = new Map<string, Entry>();
  /** LSH buckets: band → anchor → entries. */
  private bands = new Map<string, Map<string, Set<Entry>>>();
  /** SimHash: every entry with a prompt, per scope. */
  private byScope = new Map<string, Set<Entry>>();
  stats = { exact: 0, near: 0, miss: 0, stored: 0, evicted: 0, expired: 0, guardRejected: 0 };

  constructor(
    readonly capacity = 5000,
    readonly index: NearIndex = "minhash",
  ) {}

  get size(): number {
    return this.exact.size;
  }

  private probe(prompt: string): Probe {
    const tokens = normalizePrompt(prompt);
    const set = shingles(tokens);
    if (this.index === "minhash") {
      const sig = minhash(set);
      return { prompt, gk: guardKey(tokens), sig, sim: null, bands: lshKeys(sig) };
    }
    return { prompt, gk: guardKey(tokens), sig: null, sim: simhash(set), bands: [] };
  }

  /**
   * `scope` separates what must never be shared (tenant, model tier, system prompt);
   * `key` is the full canonical request within it; `prompt` is the single-turn user
   * text used for near matching (null for multi-turn conversations).
   */
  lookup(scope: string, key: string, prompt: string | null, now: number, near: NearOptions | null): CacheLookup {
    const hit = this.exact.get(scope + "\n" + key);
    if (hit) {
      if (hit.expiresAt <= now) this.remove(hit, "expired");
      else {
        this.touch(hit);
        this.stats.exact++;
        return { kind: "exact", response: hit, similarity: 1, ageMs: now - hit.createdAt };
      }
    }
    if (!near || prompt === null) {
      this.stats.miss++;
      return { kind: "miss" };
    }
    const p = this.probe(prompt);
    const useGuard = near.guard !== false;
    const scored: { e: Entry; s: number }[] = [];
    let rejected: CacheLookup["rejected"];
    const consider = (e: Entry, s: number) => {
      if (this.index === "minhash" && s < near.threshold) return;
      if (useGuard && e.probe!.gk.anchor !== p.gk.anchor) {
        if (!rejected || s > rejected.similarity) rejected = { similarity: s, reason: guardKeys(p.gk, e.probe!.gk).reason! };
        return;
      }
      scored.push({ e, s });
    };

    if (this.index === "minhash") {
      const seen = new Set<Entry>();
      const visit = (entries: Set<Entry>, one: boolean) => {
        for (const e of entries) {
          if (seen.has(e)) continue;
          seen.add(e);
          consider(e, minhashSimilarity(p.sig!, e.probe!.sig!));
          if (one) return;
        }
      };
      let peeks = 0;
      for (const band of p.bands) {
        const bucket = this.bands.get(scope + "\n" + band);
        if (!bucket) continue;
        if (!useGuard) {
          for (const entries of bucket.values()) visit(entries, false);
          continue;
        }
        const same = bucket.get(p.gk.anchor);
        if (same) visit(same, false);
        // A few entries with other numbers are scored only to explain a miss
        // ("nearest 0.87 rejected: different numbers").
        if (peeks < 4)
          for (const [anchor, entries] of bucket) {
            if (anchor === p.gk.anchor) continue;
            visit(entries, true);
            if (++peeks >= 4) break;
          }
      }
    } else {
      const max = near.maxHamming ?? 8;
      for (const e of this.byScope.get(scope) ?? []) {
        const d = hamming(p.sim!, e.probe!.sim!);
        if (d <= max) consider(e, 1 - d / 64);
      }
    }

    scored.sort((a, b) => b.s - a.s);
    let checked = 0;
    for (const { e, s } of scored) {
      if (e.expiresAt <= now) {
        this.remove(e, "expired");
        continue;
      }
      if (useGuard) {
        // The full guard runs on the best few candidates only.
        if (++checked > 8) break;
        const g = guardKeys(p.gk, e.probe!.gk);
        if (!g.ok) {
          this.stats.guardRejected++;
          if (!rejected || s > rejected.similarity) rejected = { similarity: s, reason: g.reason! };
          continue;
        }
      }
      this.touch(e);
      this.stats.near++;
      return { kind: "near", response: e, similarity: s, ageMs: now - e.createdAt, probe: p };
    }
    this.stats.miss++;
    return { kind: "miss", rejected, probe: p };
  }

  store(scope: string, key: string, prompt: string | null, value: CachedResponse, now: number, ttlMs: number, probe?: Probe): void {
    const full = scope + "\n" + key;
    const old = this.exact.get(full);
    if (old) this.remove(old, "replaced");
    const p = prompt === null ? null : probe && probe.prompt === prompt ? probe : this.probe(prompt);
    const bandKeys = p ? p.bands.map((b) => scope + "\n" + b) : [];
    const e: Entry = { ...value, key: full, scope, createdAt: now, expiresAt: now + ttlMs, hits: 0, probe: p, bandKeys };
    this.exact.set(full, e);
    for (const b of bandKeys) {
      let bucket = this.bands.get(b);
      if (!bucket) this.bands.set(b, (bucket = new Map()));
      let s = bucket.get(p!.gk.anchor);
      if (!s) bucket.set(p!.gk.anchor, (s = new Set()));
      s.add(e);
    }
    if (p && this.index === "simhash") {
      let s = this.byScope.get(scope);
      if (!s) this.byScope.set(scope, (s = new Set()));
      s.add(e);
    }
    this.stats.stored++;
    while (this.exact.size > this.capacity) {
      const oldest = this.exact.values().next().value as Entry;
      this.remove(oldest, "evicted");
    }
  }

  clear(): void {
    this.exact.clear();
    this.bands.clear();
    this.byScope.clear();
  }

  private touch(e: Entry): void {
    e.hits++;
    this.exact.delete(e.key);
    this.exact.set(e.key, e);
  }

  private remove(e: Entry, why: "expired" | "evicted" | "replaced"): void {
    this.exact.delete(e.key);
    for (const b of e.bandKeys) {
      const bucket = this.bands.get(b);
      const s = bucket?.get(e.probe!.gk.anchor);
      if (!s) continue;
      s.delete(e);
      if (!s.size) bucket!.delete(e.probe!.gk.anchor);
      if (!bucket!.size) this.bands.delete(b);
    }
    this.byScope.get(e.scope)?.delete(e);
    if (why === "expired") this.stats.expired++;
    if (why === "evicted") this.stats.evicted++;
  }
}
