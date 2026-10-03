import { commitDeal, isSeed } from "./deck";
import { applyEvent } from "./reducer";
import { CLASSIC_RULES, isValidCardCount, timeLimitMs, triplePoints, type Rules } from "./rules";
import { computeStandings } from "./standings";
import type { ClearReason, Decision, FinishReason, MatchCreated, MatchEvent, MatchFinished, MatchMode, MatchPlayerInfo, MatchState } from "./types";

// Command handlers: (state, command, now) -> events | rejection.
// They validate against the current state and never mutate it; the caller appends the
// returned events to the log and folds them with applyEvent(). This is the only place
// game rules are enforced, and it runs on the server, never on a client.

export interface NewMatchInput {
  readonly matchId: string;
  readonly mode: MatchMode;
  readonly seed: string;
  readonly cardCount: number;
  readonly players: readonly MatchPlayerInfo[];
  readonly now: number;
  readonly rules?: Rules;
}

export function createMatch(input: NewMatchInput): MatchCreated {
  const rules = input.rules ?? CLASSIC_RULES;
  if (!isSeed(input.seed)) throw new RangeError("seed must be 32 lowercase hex chars (128 bits)");
  if (!isValidCardCount(input.cardCount, rules)) throw new RangeError(`invalid card count ${input.cardCount}`);
  const n = input.players.length;
  if (n < rules.players.min || n > rules.players.max) throw new RangeError(`invalid player count ${n}`);
  if (new Set(input.players.map((p) => p.id)).size !== n) throw new RangeError("duplicate player id");
  return {
    type: "match_created",
    at: input.now,
    matchId: input.matchId,
    mode: input.mode,
    seed: input.seed,
    commitment: commitDeal(input.seed),
    cardCount: input.cardCount,
    timeLimitMs: timeLimitMs(input.cardCount, rules),
    startsAt: input.now + rules.timing.countdownMs,
    rules,
    players: input.players,
  };
}

export function decideStart(state: MatchState, now: number): Decision {
  if (state.status !== "countdown") return reject("already_started");
  return accept([{ type: "match_started", at: now, endsAt: now + state.timeLimitMs }]);
}

export function decideFlip(state: MatchState, playerId: string, card: number, now: number): Decision {
  if (state.status === "finished") return reject("already_finished");
  if (state.status !== "active" || state.endsAt === null) return reject("not_active");
  if (now >= state.endsAt) return reject("time_up");
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return reject("not_a_player");
  if (!Number.isInteger(card) || card < 0 || card >= state.cardCount) return reject("bad_card");
  if (player.resolvingUntil !== null) return reject("resolving");
  if (player.selection.length >= 3) return reject("selection_full");
  const target = state.cards[card];
  if (!target || target.status !== "down") return reject("card_unavailable");
  if (target.value === null) throw new Error("decideFlip needs the authoritative deck (server state)");

  const events: MatchEvent[] = [{ type: "card_flipped", at: now, playerId, card, value: target.value, reflip: target.seen }];
  let next = applyEvent(state, events[0] as MatchEvent);
  const self = next.players.find((p) => p.id === playerId);
  if (!self || self.selection.length < 3) return accept(events);

  const cards = self.selection;
  const values = cards.map((i) => next.cards[i]?.value);
  if (values.every((v) => v === values[0])) {
    const claimed: MatchEvent = {
      type: "triple_claimed",
      at: now,
      playerId,
      cards,
      value: target.value,
      points: triplePoints(state.endsAt - now, state.timeLimitMs, state.rules),
    };
    events.push(claimed);
    next = applyEvent(next, claimed);
    if (next.triplesLeft === 0) events.push(finishEvent(next, "cleared", now));
  } else {
    const penalty = self.selectionReflip ? Math.min(state.rules.scoring.reflipPenalty, self.score) : 0;
    events.push({ type: "triple_failed", at: now, playerId, cards, penalty });
  }
  return accept(events);
}

/** Flip a player's face-up selection back (after a mismatch is shown, or when it idles). */
export function decideClear(state: MatchState, playerId: string, reason: ClearReason, now: number): Decision {
  if (state.status !== "active") return reject("not_active");
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return reject("not_a_player");
  if (player.selection.length === 0) return reject("selection_full");
  if (reason === "mismatch" ? player.resolvingUntil === null : player.resolvingUntil !== null) return reject("resolving");
  if (reason === "stalemate" && !isStalemate(state)) return reject("not_active");
  return accept([{ type: "selection_cleared", at: now, playerId, cards: player.selection, reason }]);
}

/** No face-down card left and nothing about to flip back: nobody can move. */
export function isStalemate(state: MatchState): boolean {
  if (state.status !== "active" || state.cards.some((c) => c.status === "down")) return false;
  if (state.players.some((p) => p.resolvingUntil !== null)) return false;
  return state.players.some((p) => p.selection.length > 0);
}

/** Break a stalemate: every partial selection flips back at once. */
export function decideStalemate(state: MatchState, now: number): Decision {
  if (!isStalemate(state)) return reject("not_active");
  return accept(
    state.players
      .filter((p) => p.selection.length > 0)
      .map((p): MatchEvent => ({ type: "selection_cleared", at: now, playerId: p.id, cards: p.selection, reason: "stalemate" })),
  );
}

export function decideTimeout(state: MatchState, now: number): Decision {
  if (state.status !== "active" || state.endsAt === null) return reject("not_active");
  if (now < state.endsAt) return reject("not_active");
  return accept([finishEvent(state, "timeout", state.endsAt)]);
}

export function decideAbandon(state: MatchState, now: number): Decision {
  if (state.status === "finished") return reject("already_finished");
  return accept([finishEvent(state, "abandoned", now)]);
}

export function finishEvent(state: MatchState, reason: FinishReason, now: number): MatchFinished {
  if (state.seed === null) throw new Error("only the server can finish a match");
  return {
    type: "match_finished",
    at: now,
    reason,
    seed: state.seed,
    mode: state.mode,
    cardCount: state.cardCount,
    startedAt: state.startedAt,
    standings: computeStandings(state),
  };
}

const accept = (events: MatchEvent[]): Decision => ({ ok: true, events });
const reject = (code: Extract<Decision, { ok: false }>["code"]): Decision => ({ ok: false, code });
