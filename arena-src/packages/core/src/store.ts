import { compareSummaries, summarize, type MatchSummary, type StoredEvent } from "@arena/engine";

/**
 * Append-only match log. Each match is a stream of events numbered from 0; an append
 * names the seq it expects to write first, so two writers can never interleave a
 * stream (optimistic concurrency). Finished-match summaries are a read model the
 * store keeps alongside the log; they are derivable from the log alone.
 */
export interface EventStore {
  readonly kind: string;
  append(matchId: string, expectedSeq: number, events: readonly StoredEvent[]): Promise<void>;
  load(matchId: string): Promise<StoredEvent[]>;
  /** Newest first. */
  recentFinished(limit: number): Promise<MatchSummary[]>;
  /** Oldest first, the order projections must replay in. */
  allFinished(): Promise<MatchSummary[]>;
  healthy(): Promise<boolean>;
  close(): Promise<void>;
}

export class ConcurrencyError extends Error {
  constructor(
    readonly matchId: string,
    readonly expectedSeq: number,
    readonly actualSeq: number,
  ) {
    super(`append to ${matchId} expected seq ${expectedSeq} but the stream is at ${actualSeq}`);
    this.name = "ConcurrencyError";
  }
}

/** Shared append validation for every store implementation. */
export function checkAppend(matchId: string, expectedSeq: number, currentLength: number, events: readonly StoredEvent[]): void {
  if (expectedSeq !== currentLength) throw new ConcurrencyError(matchId, expectedSeq, currentLength);
  events.forEach((e, i) => {
    if (e.matchId !== matchId || e.seq !== expectedSeq + i) throw new RangeError(`event ${i} of batch has matchId/seq ${e.matchId}/${e.seq}`);
  });
  if (expectedSeq === 0 && events[0]?.event.type !== "match_created") throw new RangeError("a stream must start with match_created");
}

export function summaryOf(e: StoredEvent): MatchSummary | null {
  return e.event.type === "match_finished" ? summarize(e.matchId, e.event) : null;
}

/** Default store: process memory. Fast, and gone on restart. */
export class MemoryEventStore implements EventStore {
  readonly kind: string = "memory";
  protected readonly streams = new Map<string, StoredEvent[]>();
  protected readonly summaries: MatchSummary[] = [];

  async append(matchId: string, expectedSeq: number, events: readonly StoredEvent[]): Promise<void> {
    const stream = this.streams.get(matchId) ?? [];
    checkAppend(matchId, expectedSeq, stream.length, events);
    // Events are immutable once written: store copies, hand out copies.
    for (const e of events) {
      stream.push(structuredCopy(e));
      const s = summaryOf(e);
      if (s) this.summaries.push(s);
    }
    this.streams.set(matchId, stream);
  }

  async load(matchId: string): Promise<StoredEvent[]> {
    return (this.streams.get(matchId) ?? []).map(structuredCopy);
  }

  async recentFinished(limit: number): Promise<MatchSummary[]> {
    return [...this.summaries].sort(compareSummaries).reverse().slice(0, limit);
  }

  async allFinished(): Promise<MatchSummary[]> {
    return [...this.summaries].sort(compareSummaries);
  }

  async healthy(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}

function structuredCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
