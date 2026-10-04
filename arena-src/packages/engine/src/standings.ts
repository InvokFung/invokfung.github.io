import type { MatchState, PlayerState, Standing } from "./types";

/**
 * Final order: score, then triples, then whoever made their last claim first, then seat.
 * Rank only looks at score and triples, so true ties share a rank (1, 1, 3).
 */
export function computeStandings(state: Pick<MatchState, "players">): Standing[] {
  const order = [...state.players].sort(compare);
  const standings: Standing[] = [];
  order.forEach((p, i) => {
    const prev = standings[i - 1];
    const tied = prev !== undefined && prev.score === p.score && prev.triples === p.triples;
    standings.push({
      playerId: p.id,
      name: p.name,
      kind: p.kind,
      botLevel: p.botLevel,
      seat: p.seat,
      rank: tied ? prev.rank : i + 1,
      score: p.score,
      triples: p.triples,
      attempts: p.attempts,
      penalties: p.penalties,
      flips: p.flips,
    });
  });
  return standings;
}

function compare(a: PlayerState, b: PlayerState): number {
  return (
    b.score - a.score ||
    b.triples - a.triples ||
    (a.lastClaimAt ?? Number.MAX_SAFE_INTEGER) - (b.lastClaimAt ?? Number.MAX_SAFE_INTEGER) ||
    a.seat - b.seat
  );
}

/** Triples found per attempt, 0..1. */
export function accuracy(s: { triples: number; attempts: number }): number {
  return s.attempts === 0 ? 0 : s.triples / s.attempts;
}
