import { commitDeal, dealDeck } from "./deck";
import { applyEvent } from "./reducer";
import type { MatchEvent, MatchFinished, MatchMode, MatchState, Standing, StoredEvent } from "./types";

/** Every intermediate state of a match, index i = state after event i. */
export function replayStates(events: readonly MatchEvent[]): MatchState[] {
  const states: MatchState[] = [];
  let state: MatchState | null = null;
  for (const event of events) {
    state = applyEvent(state, event);
    states.push(state);
  }
  return states;
}

/** Verify a stored log is gap-free and starts with match_created. */
export function checkLog(stored: readonly StoredEvent[]): MatchEvent[] {
  stored.forEach((s, i) => {
    if (s.seq !== i) throw new Error(`event log gap: expected seq ${i}, got ${s.seq}`);
  });
  if (stored[0]?.event.type !== "match_created") throw new Error("log must start with match_created");
  return stored.map((s) => s.event);
}

export interface DealVerification {
  readonly ok: boolean;
  /** sha256(seed) equals the commitment published before the first flip. */
  readonly commitmentMatches: boolean;
  /** Every value revealed during play equals the card dealt from that seed. */
  readonly revealsMatch: boolean;
  readonly checkedReveals: number;
}

/**
 * Client-side fairness check. `commitment` is what the client saw while the match
 * was live; `seed` is revealed by match_finished; `reveals` are the (card, value)
 * pairs the client was shown during play.
 */
export function verifyDeal(input: {
  readonly commitment: string;
  readonly seed: string;
  readonly cardCount: number;
  readonly reveals: Iterable<readonly [number, number]>;
}): DealVerification {
  const commitmentMatches = commitDeal(input.seed) === input.commitment;
  const deck = dealDeck(input.seed, input.cardCount);
  let checkedReveals = 0;
  let revealsMatch = true;
  for (const [card, value] of input.reveals) {
    checkedReveals++;
    if (deck[card] !== value) revealsMatch = false;
  }
  return { ok: commitmentMatches && revealsMatch, commitmentMatches, revealsMatch, checkedReveals };
}

/** Score after every scoring event, per player: the "momentum" chart is a projection of the log. */
export interface ScorePoint {
  readonly at: number;
  readonly score: number;
  readonly kind: "start" | "claim" | "fail" | "end";
}

export function scoreTimeline(events: readonly MatchEvent[]): Map<string, ScorePoint[]> {
  const out = new Map<string, ScorePoint[]>();
  let state: MatchState | null = null;
  for (const event of events) {
    state = applyEvent(state, event);
    if (event.type === "match_started") {
      for (const p of state.players) out.set(p.id, [{ at: event.at, score: 0, kind: "start" }]);
    } else if (event.type === "triple_claimed" || event.type === "triple_failed") {
      const p = state.players.find((x) => x.id === event.playerId);
      if (p) out.get(p.id)?.push({ at: event.at, score: p.score, kind: event.type === "triple_claimed" ? "claim" : "fail" });
    } else if (event.type === "match_finished") {
      for (const p of state.players) out.get(p.id)?.push({ at: event.at, score: p.score, kind: "end" });
    }
  }
  return out;
}

/** The read model of a finished match, derived from its match_finished event alone. */
export interface MatchSummary {
  readonly matchId: string;
  readonly mode: MatchMode;
  readonly cardCount: number;
  readonly reason: MatchFinished["reason"];
  readonly startedAt: number | null;
  readonly finishedAt: number;
  readonly standings: readonly Standing[];
}

export function summarize(matchId: string, finished: MatchFinished): MatchSummary {
  return {
    matchId,
    mode: finished.mode,
    cardCount: finished.cardCount,
    reason: finished.reason,
    startedAt: finished.startedAt,
    finishedAt: finished.at,
    standings: finished.standings,
  };
}

/** Stable order for projections: by finish time, ties by id. */
export function compareSummaries(a: MatchSummary, b: MatchSummary): number {
  return a.finishedAt - b.finishedAt || (a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0);
}
