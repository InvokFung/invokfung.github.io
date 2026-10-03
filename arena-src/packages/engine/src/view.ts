import type { CardState, MatchEvent, MatchState, PublicMatchEvent } from "./types";

/**
 * What any client (player, spectator, reconnecting player) may see of a match.
 * Face-down cards carry no value, including cards that were revealed earlier and
 * flipped back: otherwise a second tab, a spectator link or a reconnect would hand
 * out perfect memory. The seed stays hidden until the match is finished.
 */
export function toPublicView(state: MatchState): MatchState {
  return {
    ...state,
    seed: state.status === "finished" ? state.seed : null,
    cards: state.cards.map((c): CardState => (c.status === "down" ? { ...c, value: null } : c)),
  };
}

/** The live stream: everything but `match_created`, which holds the seed. */
export function toPublicEvent(event: MatchEvent): PublicMatchEvent | null {
  return event.type === "match_created" ? null : event;
}

/** Values visible in a public view; used by tests to prove nothing face-down leaks. */
export function visibleValues(state: MatchState): Map<number, number> {
  const out = new Map<number, number>();
  state.cards.forEach((c, i) => {
    if (c.value !== null) out.set(i, c.value);
  });
  return out;
}
