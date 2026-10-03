import type { Rules } from "./rules";

export type BotLevel = "rookie" | "adept" | "ace";
export type PlayerKind = "human" | "bot";
export type MatchMode = "quick" | "room";
export type MatchStatus = "countdown" | "active" | "finished";
export type FinishReason = "cleared" | "timeout" | "abandoned";
export type ClearReason = "mismatch" | "idle" | "stalemate";

export interface MatchPlayerInfo {
  readonly id: string;
  readonly name: string;
  readonly kind: PlayerKind;
  /** Seat 0-3; also picks the player's colour on the client. */
  readonly seat: number;
  readonly botLevel: BotLevel | null;
}

// ---------------------------------------------------------------- events
// The append-only log of a match. Only `match_created` carries a secret (the seed);
// it is never streamed live. Every other event is public the moment it happens.

export interface MatchCreated {
  readonly type: "match_created";
  readonly at: number;
  readonly matchId: string;
  readonly mode: MatchMode;
  readonly seed: string;
  readonly commitment: string;
  readonly cardCount: number;
  readonly timeLimitMs: number;
  readonly startsAt: number;
  readonly rules: Rules;
  readonly players: readonly MatchPlayerInfo[];
}

export interface MatchStarted {
  readonly type: "match_started";
  readonly at: number;
  readonly endsAt: number;
}

export interface CardFlipped {
  readonly type: "card_flipped";
  readonly at: number;
  readonly playerId: string;
  readonly card: number;
  readonly value: number;
  /** The card had been face up before (by anyone): failing with it costs the reflip penalty. */
  readonly reflip: boolean;
}

export interface TripleClaimed {
  readonly type: "triple_claimed";
  readonly at: number;
  readonly playerId: string;
  readonly cards: readonly number[];
  readonly value: number;
  readonly points: number;
}

export interface TripleFailed {
  readonly type: "triple_failed";
  readonly at: number;
  readonly playerId: string;
  readonly cards: readonly number[];
  /** Points actually deducted (the penalty, capped so the score never goes negative). */
  readonly penalty: number;
}

export interface SelectionCleared {
  readonly type: "selection_cleared";
  readonly at: number;
  readonly playerId: string;
  readonly cards: readonly number[];
  readonly reason: ClearReason;
}

export interface Standing {
  readonly playerId: string;
  readonly name: string;
  readonly kind: PlayerKind;
  readonly botLevel: BotLevel | null;
  readonly seat: number;
  readonly rank: number;
  readonly score: number;
  readonly triples: number;
  readonly attempts: number;
  readonly penalties: number;
  readonly flips: number;
}

export interface MatchFinished {
  readonly type: "match_finished";
  readonly at: number;
  readonly reason: FinishReason;
  /** Commit-reveal: the seed behind the deal, published once nothing can change. */
  readonly seed: string;
  readonly mode: MatchMode;
  readonly cardCount: number;
  readonly startedAt: number | null;
  readonly standings: readonly Standing[];
}

export type MatchEvent = MatchCreated | MatchStarted | CardFlipped | TripleClaimed | TripleFailed | SelectionCleared | MatchFinished;
export type MatchEventType = MatchEvent["type"];
/** Everything except the event that carries the secret seed. */
export type PublicMatchEvent = Exclude<MatchEvent, MatchCreated>;

/** How an event sits in the store: numbered from 0 within its match. */
export interface StoredEvent {
  readonly matchId: string;
  readonly seq: number;
  readonly event: MatchEvent;
}

// ---------------------------------------------------------------- state

export interface CardState {
  /** Server: always known. Client: null unless face up or claimed. */
  readonly value: number | null;
  readonly status: "down" | "up" | "claimed";
  /** Player holding it face up, or who claimed it. */
  readonly holder: string | null;
  /** Has been face up at least once. */
  readonly seen: boolean;
}

export interface PlayerState extends MatchPlayerInfo {
  readonly score: number;
  readonly triples: number;
  readonly attempts: number;
  readonly penalties: number;
  readonly flips: number;
  readonly selection: readonly number[];
  /** Any card in the current selection was a reflip. */
  readonly selectionReflip: boolean;
  /** Set while a failed triple is being shown; flips are refused until it clears. */
  readonly resolvingUntil: number | null;
  readonly lastFlipAt: number | null;
  readonly lastClaimAt: number | null;
}

export interface MatchState {
  readonly matchId: string;
  readonly mode: MatchMode;
  readonly rules: Rules;
  readonly cardCount: number;
  readonly timeLimitMs: number;
  readonly commitment: string;
  /** Server: always set. Clients: null until match_finished reveals it. */
  readonly seed: string | null;
  readonly status: MatchStatus;
  readonly createdAt: number;
  readonly startsAt: number;
  readonly startedAt: number | null;
  readonly endsAt: number | null;
  readonly finishedAt: number | null;
  readonly finishReason: FinishReason | null;
  readonly players: readonly PlayerState[];
  readonly cards: readonly CardState[];
  readonly triplesLeft: number;
  readonly standings: readonly Standing[] | null;
  /** seq of the last applied event (match_created is 0). */
  readonly seq: number;
}

export type RejectCode =
  | "not_active"
  | "time_up"
  | "not_a_player"
  | "bad_card"
  | "card_unavailable"
  | "resolving"
  | "selection_full"
  | "already_started"
  | "already_finished";

export type Decision = { readonly ok: true; readonly events: MatchEvent[] } | { readonly ok: false; readonly code: RejectCode };
