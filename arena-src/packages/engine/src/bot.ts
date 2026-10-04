import type { Rng } from "./rng";
import type { BotLevel, MatchState } from "./types";

/**
 * Bots play through the public protocol like anyone else: they only ever learn a
 * card's value by watching it being flipped, and they forget. Memory is a bounded
 * set of (card -> value) observations, each with an exponentially distributed
 * lifetime (median `halfLifeMs`), drawn once when the card is seen, so forgetting
 * depends on elapsed time and not on how often the bot thinks. Recalling can also
 * "slip" onto a neighbouring card.
 */
export interface BotProfile {
  readonly level: BotLevel;
  readonly label: string;
  /** Delay before each flip, uniform in [min, max] ms. */
  readonly thinkMs: readonly [number, number];
  /** Most observations kept; the oldest are dropped first. */
  readonly memorySlots: number;
  readonly halfLifeMs: number;
  /** Chance a confident recall lands on an adjacent card instead. */
  readonly slipChance: number;
  /** Prefer never-seen cards when exploring (avoids the reflip penalty). */
  readonly cautious: boolean;
}

export const BOT_PROFILES: Readonly<Record<BotLevel, BotProfile>> = {
  rookie: { level: "rookie", label: "Rookie", thinkMs: [800, 1400], memorySlots: 8, halfLifeMs: 15_000, slipChance: 0.12, cautious: false },
  adept: { level: "adept", label: "Adept", thinkMs: [650, 1200], memorySlots: 10, halfLifeMs: 20_000, slipChance: 0.08, cautious: true },
  ace: { level: "ace", label: "Ace", thinkMs: [420, 800], memorySlots: 20, halfLifeMs: 60_000, slipChance: 0.03, cautious: true },
};

export const BOT_LEVELS: readonly BotLevel[] = ["rookie", "adept", "ace"];

interface Memory {
  readonly value: number;
  /** When this observation is forgotten. */
  readonly until: number;
}

/** How long a cautious bot waits for held cards to come back before it plays a pair. */
export const BOT_PATIENCE_MS = 2500;

export class BotMind {
  private readonly memory = new Map<number, Memory>();
  /** When the bot started waiting for others to let go of cards (cautious only). */
  private waitingSince: number | null = null;

  constructor(
    readonly profile: BotProfile,
    private readonly rng: Rng,
  ) {}

  /** Record a reveal the bot was shown. */
  observe(card: number, value: number, at: number): void {
    this.memory.delete(card); // re-insert so Map order stays oldest-first
    const lifetime = (-Math.log(1 - this.rng.next()) * this.profile.halfLifeMs) / Math.LN2;
    this.memory.set(card, { value, until: at + lifetime });
    while (this.memory.size > this.profile.memorySlots) {
      const oldest = this.memory.keys().next();
      if (oldest.done) break;
      this.memory.delete(oldest.value);
    }
  }

  forget(card: number): void {
    this.memory.delete(card);
  }

  thinkDelay(): number {
    const [min, max] = this.profile.thinkMs;
    return this.rng.between(min, max);
  }

  /** Remembered cards (for tests and debugging). */
  known(): ReadonlyMap<number, number> {
    return new Map([...this.memory].map(([card, m]) => [card, m.value]));
  }

  /** Next card to flip, or null when there is nothing the bot may flip. */
  chooseCard(state: MatchState, selfId: string, now: number): number | null {
    const self = state.players.find((p) => p.id === selfId);
    if (!self || state.status !== "active" || self.resolvingUntil !== null || self.selection.length >= 3) return null;
    const available: number[] = [];
    state.cards.forEach((c, i) => {
      if (c.status === "down") available.push(i);
    });
    if (available.length === 0) return null;

    const recalled = new Map<number, number>();
    for (const card of available) {
      const value = this.recall(card, now);
      if (value !== null) recalled.set(card, value);
    }

    const choice = this.decide(state, self.selection, available, recalled, now);
    this.waitingSince = choice === null ? (this.waitingSince ?? now) : null;
    return choice;
  }

  private decide(state: MatchState, selection: readonly number[], available: number[], recalled: ReadonlyMap<number, number>, now: number): number | null {
    const held = selection.map((c) => state.cards[c]?.value ?? null);
    const holding = held[0] ?? null;
    // Two different values up already: this attempt is lost, so at least learn a new card.
    if (held.length === 2 && held[0] !== held[1]) return this.explore(state, available, recalled);
    // Everything still face down is already known: grabbing more only blocks the board.
    // A cautious bot waits for held cards to flip back, but not forever: people (and
    // other bots) can keep a card in hand for a long time.
    const nothingToLearn = recalled.size === available.length;
    const patient = this.profile.cautious && (this.waitingSince === null || now - this.waitingSince < BOT_PATIENCE_MS);
    if (holding !== null) {
      const matches = [...recalled].filter(([, v]) => v === holding).map(([card]) => card);
      if (matches.length > 0) return this.slip(this.rng.pick(matches), available);
      if (nothingToLearn && patient) return null; // the rest of the triple is in someone's hands: wait
      return this.explore(state, available, recalled);
    }

    // Start a triple only when all three positions are (believed to be) known.
    const byValue = new Map<number, number[]>();
    for (const [card, v] of recalled) byValue.set(v, [...(byValue.get(v) ?? []), card]);
    const groups = [...byValue.values()].sort((a, b) => b.length - a.length);
    const full = groups.find((cards) => cards.length >= 3);
    if (full) return this.slip(full[0] as number, available);
    if (nothingToLearn && patient) return null;
    // Out of patience: open a known pair, so the triple completes when the last card returns.
    const pair = groups.find((cards) => cards.length >= 2);
    if (nothingToLearn && pair) return this.slip(pair[0] as number, available);
    return this.explore(state, available, recalled);
  }

  private recall(card: number, now: number): number | null {
    const m = this.memory.get(card);
    if (!m) return null;
    if (now < m.until) return m.value;
    this.memory.delete(card);
    return null;
  }

  private slip(card: number, available: readonly number[]): number {
    if (this.rng.next() >= this.profile.slipChance) return card;
    const near = available.filter((c) => c !== card && Math.abs(c - card) <= 1);
    return near.length > 0 ? this.rng.pick(near) : card;
  }

  private explore(state: MatchState, available: readonly number[], recalled: ReadonlyMap<number, number>): number {
    const unknown = available.filter((c) => !recalled.has(c));
    const pool = unknown.length > 0 ? unknown : available;
    if (this.profile.cautious) {
      const fresh = pool.filter((c) => !state.cards[c]?.seen);
      if (fresh.length > 0) return this.rng.pick(fresh);
    }
    return this.rng.pick(pool);
  }
}
