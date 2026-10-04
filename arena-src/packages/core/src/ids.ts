import { ROOM_CODE_ALPHABET } from "@arena/protocol";
import type { RandomSource } from "./ports";

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Unbiased draw of `length` symbols from `alphabet` (rejection sampling on bytes). */
export function randomString(random: RandomSource, alphabet: string, length: number): string {
  const limit = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < length) {
    for (const b of random.bytes(length * 2)) {
      if (b < limit) out += alphabet[b % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export const newId = (random: RandomSource, prefix: "p" | "m" | "b") => `${prefix}_${randomString(random, ID_ALPHABET, 12)}`;
export const newRoomCode = (random: RandomSource) => randomString(random, ROOM_CODE_ALPHABET, 5);
export const newSeed = (random: RandomSource) => Array.from(random.bytes(16), (b) => b.toString(16).padStart(2, "0")).join("");
