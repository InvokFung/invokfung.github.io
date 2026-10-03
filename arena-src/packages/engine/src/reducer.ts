import { dealDeck } from "./deck";
import type { CardState, MatchCreated, MatchEvent, MatchState, PlayerState } from "./types";

/**
 * The single fold used everywhere: the server's live match, the client's mirror
 * of it, the replay viewer and the projections. Pure and total over valid logs;
 * it never consults a clock, so folding the same events always gives the same state.
 */
export function applyEvent(state: MatchState | null, event: MatchEvent): MatchState {
  if (event.type === "match_created") return initialState(event);
  if (!state) throw new Error(`cannot apply ${event.type} before match_created`);
  const next = reduce(state, event);
  return { ...next, seq: state.seq + 1 };
}

export function foldEvents(events: readonly MatchEvent[]): MatchState {
  let state: MatchState | null = null;
  for (const event of events) state = applyEvent(state, event);
  if (!state) throw new Error("empty event log");
  return state;
}

export function initialState(e: MatchCreated): MatchState {
  const deck = dealDeck(e.seed, e.cardCount);
  return {
    matchId: e.matchId,
    mode: e.mode,
    rules: e.rules,
    cardCount: e.cardCount,
    timeLimitMs: e.timeLimitMs,
    commitment: e.commitment,
    seed: e.seed,
    status: "countdown",
    createdAt: e.at,
    startsAt: e.startsAt,
    startedAt: null,
    endsAt: null,
    finishedAt: null,
    finishReason: null,
    players: e.players.map(
      (p): PlayerState => ({
        ...p,
        score: 0,
        triples: 0,
        attempts: 0,
        penalties: 0,
        flips: 0,
        selection: [],
        selectionReflip: false,
        resolvingUntil: null,
        lastFlipAt: null,
        lastClaimAt: null,
      }),
    ),
    cards: deck.map((value): CardState => ({ value, status: "down", holder: null, seen: false })),
    triplesLeft: e.cardCount / 3,
    standings: null,
    seq: 0,
  };
}

function reduce(state: MatchState, event: Exclude<MatchEvent, MatchCreated>): MatchState {
  switch (event.type) {
    case "match_started":
      return { ...state, status: "active", startedAt: event.at, endsAt: event.endsAt };

    case "card_flipped":
      return {
        ...state,
        cards: patchCards(state.cards, [event.card], () => ({ value: event.value, status: "up", holder: event.playerId, seen: true })),
        players: patchPlayer(state.players, event.playerId, (p) => ({
          ...p,
          selection: [...p.selection, event.card],
          selectionReflip: p.selectionReflip || event.reflip,
          flips: p.flips + 1,
          lastFlipAt: event.at,
        })),
      };

    case "triple_claimed":
      return {
        ...state,
        cards: patchCards(state.cards, event.cards, (c) => ({ ...c, value: event.value, status: "claimed", holder: event.playerId })),
        players: patchPlayer(state.players, event.playerId, (p) => ({
          ...p,
          selection: [],
          selectionReflip: false,
          score: p.score + event.points,
          triples: p.triples + 1,
          attempts: p.attempts + 1,
          lastClaimAt: event.at,
        })),
        triplesLeft: state.triplesLeft - 1,
      };

    case "triple_failed":
      return {
        ...state,
        players: patchPlayer(state.players, event.playerId, (p) => ({
          ...p,
          attempts: p.attempts + 1,
          penalties: p.penalties + (event.penalty > 0 ? 1 : 0),
          score: p.score - event.penalty,
          resolvingUntil: event.at + state.rules.timing.mismatchRevealMs,
        })),
      };

    case "selection_cleared":
      return {
        ...state,
        // The value stays in this state object (the server always knows it; a client
        // remembers what it was shown). toPublicView() strips face-down values.
        cards: patchCards(state.cards, event.cards, (c) => (c.status === "up" && c.holder === event.playerId ? { ...c, status: "down", holder: null } : c)),
        players: patchPlayer(state.players, event.playerId, (p) => ({ ...p, selection: [], selectionReflip: false, resolvingUntil: null })),
      };

    case "match_finished":
      return {
        ...state,
        status: "finished",
        finishedAt: event.at,
        finishReason: event.reason,
        standings: event.standings,
        seed: event.seed,
      };
  }
}

function patchPlayer(players: readonly PlayerState[], id: string, fn: (p: PlayerState) => PlayerState): PlayerState[] {
  return players.map((p) => (p.id === id ? fn(p) : p));
}

function patchCards(cards: readonly CardState[], indices: readonly number[], fn: (c: CardState) => CardState): CardState[] {
  const next = cards.slice();
  for (const i of indices) {
    const card = next[i];
    if (card) next[i] = fn(card);
  }
  return next;
}
