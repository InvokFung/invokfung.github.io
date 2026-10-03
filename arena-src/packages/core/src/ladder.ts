import type { BotLevel, MatchSummary } from "@arena/engine";
import type { LadderEntry, RatingChange } from "@arena/protocol";
import type { EventStore } from "./store";

export const INITIAL_RATING = 1200;
const K = 32;

/** Bots are fixed anchors: they move human ratings but never move themselves. */
export const BOT_ANCHORS: Readonly<Record<BotLevel, number>> = { rookie: 1000, adept: 1200, ace: 1400 };

interface Row {
  name: string;
  rating: number;
  games: number;
  wins: number;
  lastPlayedAt: number;
}

/**
 * Elo ladder as a projection over finished matches. A free-for-all of n players is
 * scored as n-1 pairwise games per player, each worth K/(n-1). Applying is idempotent
 * per match id, so the live path and a rebuild from the event store can never
 * double-count, and replaying the same summaries in the same order gives the same table.
 */
export class Ladder {
  private readonly rows = new Map<string, Row>();
  private readonly applied = new Set<string>();

  rating(playerId: string): number {
    return this.rows.get(playerId)?.rating ?? INITIAL_RATING;
  }

  has(matchId: string): boolean {
    return this.applied.has(matchId);
  }

  apply(summary: MatchSummary): RatingChange[] {
    if (this.applied.has(summary.matchId)) return [];
    this.applied.add(summary.matchId);
    const field = summary.standings;
    if (summary.reason === "abandoned" || field.length < 2 || !field.some((s) => s.kind === "human")) return [];

    const before = new Map(field.map((s) => [s.playerId, s.kind === "bot" ? BOT_ANCHORS[s.botLevel ?? "adept"] : this.rating(s.playerId)]));
    const share = K / (field.length - 1);
    const changes: RatingChange[] = [];
    for (const me of field) {
      if (me.kind !== "human") continue;
      const mine = before.get(me.playerId) as number;
      let delta = 0;
      for (const other of field) {
        if (other.playerId === me.playerId) continue;
        const theirs = before.get(other.playerId) as number;
        const expected = 1 / (1 + Math.pow(10, (theirs - mine) / 400));
        const actual = me.rank < other.rank ? 1 : me.rank === other.rank ? 0.5 : 0;
        delta += share * (actual - expected);
      }
      const row = this.rows.get(me.playerId) ?? { name: me.name, rating: INITIAL_RATING, games: 0, wins: 0, lastPlayedAt: 0 };
      row.name = me.name;
      row.rating = mine + delta;
      row.games += 1;
      row.wins += me.rank === 1 ? 1 : 0;
      row.lastPlayedAt = summary.finishedAt;
      this.rows.set(me.playerId, row);
      changes.push({ playerId: me.playerId, before: Math.round(mine), after: Math.round(row.rating) });
    }
    return changes;
  }

  entries(limit = 50): LadderEntry[] {
    return [...this.rows]
      .map(([playerId, r]) => ({ playerId, name: r.name, rating: Math.round(r.rating), games: r.games, wins: r.wins, lastPlayedAt: r.lastPlayedAt }))
      .sort((a, b) => b.rating - a.rating || b.games - a.games || a.playerId.localeCompare(b.playerId))
      .slice(0, limit);
  }

  static fromSummaries(summaries: Iterable<MatchSummary>): Ladder {
    const ladder = new Ladder();
    for (const s of summaries) ladder.apply(s);
    return ladder;
  }

  static async rebuild(store: EventStore): Promise<Ladder> {
    return Ladder.fromSummaries(await store.allFinished());
  }
}
