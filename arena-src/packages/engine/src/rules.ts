/**
 * Every tunable of the game, expressed as data. A copy of the rule set travels in
 * each match's `match_created` event, so a replay is rebuilt with the exact
 * rules it was played under even after the defaults change.
 *
 * The numbers come from the original single-player TripleFind (triplefind/script/index.js):
 *  - time limit: floor(6 * (cards / 3)^2 / 1.85) + 13 seconds           (startGame)
 *  - a triple is worth remaining/limit * 1000, or a flat 500 once less
 *    than half the time remains, rounded to the nearest 10               (computeCurrentScore)
 *  - a failed triple that re-flips an already-seen card costs 200,
 *    never taking the score below zero                                   (doSelectCard)
 *  - mismatched cards stay face up for 800 ms before flipping back      (doSelectCard)
 * Multiplayer additions are marked as such.
 */
export interface Rules {
  readonly version: 1;
  readonly cards: { readonly min: number; readonly max: number };
  readonly timeLimit: { readonly coefficient: number; readonly divisor: number; readonly baseSeconds: number };
  readonly scoring: {
    readonly fullPoints: number;
    readonly floorPoints: number;
    readonly floorBelowRatio: number;
    readonly step: number;
    readonly reflipPenalty: number;
  };
  readonly timing: {
    /** Countdown between dealing and the first allowed flip (original: 1 s start delay). */
    readonly countdownMs: number;
    readonly mismatchRevealMs: number;
    /** Multiplayer: a partial selection left untouched this long flips back, so nobody can hoard cards. */
    readonly idleReleaseMs: number;
    /**
     * Multiplayer: when every unclaimed card is held face up and no mismatch is about to
     * flip back, nobody can move. After this pause, all partial selections flip back.
     */
    readonly stalemateReleaseMs: number;
  };
  readonly players: { readonly min: number; readonly max: number };
}

export const CLASSIC_RULES: Rules = {
  version: 1,
  cards: { min: 6, max: 36 },
  timeLimit: { coefficient: 6, divisor: 1.85, baseSeconds: 13 },
  scoring: { fullPoints: 1000, floorPoints: 500, floorBelowRatio: 0.5, step: 10, reflipPenalty: 200 },
  timing: { countdownMs: 3000, mismatchRevealMs: 800, idleReleaseMs: 6000, stalemateReleaseMs: 700 },
  players: { min: 1, max: 4 },
};

/** Shallow-merge overrides per section (used by tests and the load test to shorten timings). */
export function withRules(overrides: {
  [K in keyof Rules]?: Rules[K] extends object ? Partial<Rules[K]> : never;
}): Rules {
  return {
    version: 1,
    cards: { ...CLASSIC_RULES.cards, ...overrides.cards },
    timeLimit: { ...CLASSIC_RULES.timeLimit, ...overrides.timeLimit },
    scoring: { ...CLASSIC_RULES.scoring, ...overrides.scoring },
    timing: { ...CLASSIC_RULES.timing, ...overrides.timing },
    players: { ...CLASSIC_RULES.players, ...overrides.players },
  };
}

export function isValidCardCount(cardCount: number, rules: Rules = CLASSIC_RULES): boolean {
  return Number.isInteger(cardCount) && cardCount % 3 === 0 && cardCount >= rules.cards.min && cardCount <= rules.cards.max;
}

/** Time limit in ms for a board of `cardCount` cards (original formula, in seconds). */
export function timeLimitMs(cardCount: number, rules: Rules = CLASSIC_RULES): number {
  const { coefficient, divisor, baseSeconds } = rules.timeLimit;
  const triples = cardCount / 3;
  return (Math.floor((coefficient * triples * triples) / divisor) + baseSeconds) * 1000;
}

/** Points for a triple claimed with `remainingMs` left on a `limitMs` clock. */
export function triplePoints(remainingMs: number, limitMs: number, rules: Rules = CLASSIC_RULES): number {
  const { fullPoints, floorPoints, floorBelowRatio, step } = rules.scoring;
  const ratio = Math.min(1, Math.max(0, remainingMs / limitMs));
  const raw = ratio < floorBelowRatio ? floorPoints : ratio * fullPoints;
  return Math.round(raw / step) * step;
}

/** Quick-match board size grows with the table: 2 → 18, 3 → 21, 4 → 24 cards. */
export function quickMatchCardCount(players: number): number {
  return 12 + 3 * Math.max(2, Math.min(4, players));
}

/**
 * Near-square grid for `cardCount` cards, the original computeDisplay():
 * a perfect square when possible, otherwise one extra (partial) row.
 */
export function boardShape(cardCount: number): { columns: number; rows: number } {
  const root = Math.sqrt(cardCount);
  const frac = root - Math.floor(root);
  if (frac === 0) return { columns: root, rows: root };
  if (frac > 0.5) return { columns: Math.ceil(root), rows: Math.ceil(cardCount / Math.ceil(root)) };
  const columns = Math.floor(root);
  return { columns, rows: Math.ceil(cardCount / columns) };
}
