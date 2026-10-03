import { rngFromSeed, shuffleInPlace } from "./rng";
import { sha256Hex } from "./sha256";

/** Domain-separation prefix for the deal commitment. */
const COMMIT_PREFIX = "triplefind-arena/commit/v1:";
const DEAL_PREFIX = "triplefind-arena/deal/v1:";

/**
 * Deal `cardCount` cards: values 0..cardCount/3-1, each exactly three times, in an
 * order fully determined by the secret seed.
 */
export function dealDeck(seed: string, cardCount: number): number[] {
  if (!Number.isInteger(cardCount) || cardCount <= 0 || cardCount % 3 !== 0) {
    throw new RangeError(`cardCount must be a positive multiple of 3, got ${cardCount}`);
  }
  const values: number[] = [];
  for (let v = 0; v < cardCount / 3; v++) values.push(v, v, v);
  return shuffleInPlace(values, rngFromSeed(DEAL_PREFIX + seed));
}

/**
 * Commit-reveal: the server publishes `commitDeal(seed)` while the match is live and
 * reveals the seed in `match_finished`. Anyone can then check that the board was
 * fixed before the first flip and never changed (see verifyDeal in replay.ts).
 * Seeds carry 128 bits of entropy, so the commitment cannot be brute-forced.
 */
export function commitDeal(seed: string): string {
  return sha256Hex(COMMIT_PREFIX + seed);
}

export function isSeed(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value);
}
