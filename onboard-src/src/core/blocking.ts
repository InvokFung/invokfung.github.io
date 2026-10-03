// Multi-key blocking: only records that share at least one blocking key are
// compared. Each rule is cheap and catches what the others miss (a nickname
// breaks the name key but not the email key, a new email breaks the email key
// but not the phone key). Oversized blocks are skipped and reported.

import type { Rec } from "./types";

export interface BlockingRule {
  name: string;
  describe: string;
  key: (r: Rec) => string | null;
}

export const BLOCKING_RULES: BlockingRule[] = [
  { name: "email", describe: "same canonical email", key: (r) => r.email || null },
  { name: "phone", describe: "same E.164 phone", key: (r) => r.phone || null },
  {
    name: "name sound",
    describe: "Soundex of first and last name, in either order",
    key: (r) => (r.k.firstSx && r.k.lastSx ? [r.k.firstSx, r.k.lastSx].sort().join("|") : null),
  },
  { name: "surname + postcode", describe: "Soundex of last name and the postcode", key: (r) => (r.k.lastSx && r.k.postcode ? `${r.k.lastSx}|${r.k.postcode}` : null) },
  { name: "email local part", describe: "same mailbox name at any domain", key: (r) => (r.k.emailLocal.length >= 6 ? r.k.emailLocal : null) },
  { name: "nickname + surname", describe: "given-name root (Bob → robert) and first 4 letters of last name", key: (r) => (r.k.firstRoot && r.k.last.length >= 2 ? `${r.k.firstRoot}|${r.k.last.slice(0, 4)}` : null) },
  { name: "birth date + initial", describe: "date of birth and the initial of either name part", key: (r) => (r.dob ? `${r.dob}|${[r.k.first[0] ?? "", r.k.last[0] ?? ""].sort().join("")}` : null) },
];

export interface RuleStats {
  name: string;
  describe: string;
  blocks: number;
  largest: number;
  pairs: number;
  /** Pairs no earlier rule had produced. */
  added: number;
  skippedBlocks: number;
}

export interface BlockingResult {
  /** Candidate pairs, a[i] < b[i]. */
  a: Int32Array;
  b: Int32Array;
  rules: RuleStats[];
  totalPairs: number;
  candidates: number;
  reductionRatio: number;
  maxBlock: number;
}

export function block(recs: Rec[], rules: BlockingRule[] = BLOCKING_RULES, maxBlock = 120, skip?: Uint8Array): BlockingResult {
  const n = recs.length;
  const live = skip ? recs.filter((r) => !skip[r.i]).length : n;
  const seen = new Set<number>();
  const A: number[] = [];
  const B: number[] = [];
  const stats: RuleStats[] = [];
  for (const rule of rules) {
    const blocks = new Map<string, number[]>();
    for (const r of recs) {
      if (skip && skip[r.i]) continue;
      const k = rule.key(r);
      if (!k) continue;
      let arr = blocks.get(k);
      if (!arr) blocks.set(k, (arr = []));
      arr.push(r.i);
    }
    const st: RuleStats = { name: rule.name, describe: rule.describe, blocks: 0, largest: 0, pairs: 0, added: 0, skippedBlocks: 0 };
    for (const ids of blocks.values()) {
      if (ids.length < 2) continue;
      st.blocks++;
      if (ids.length > st.largest) st.largest = ids.length;
      if (ids.length > maxBlock) {
        st.skippedBlocks++;
        continue;
      }
      for (let x = 0; x < ids.length; x++)
        for (let y = x + 1; y < ids.length; y++) {
          const i = Math.min(ids[x], ids[y]);
          const j = Math.max(ids[x], ids[y]);
          st.pairs++;
          const key = i * n + j;
          if (seen.has(key)) continue;
          seen.add(key);
          A.push(i);
          B.push(j);
          st.added++;
        }
    }
    stats.push(st);
  }
  const totalPairs = (live * (live - 1)) / 2;
  return {
    a: Int32Array.from(A),
    b: Int32Array.from(B),
    rules: stats,
    totalPairs,
    candidates: A.length,
    reductionRatio: totalPairs ? 1 - A.length / totalPairs : 0,
    maxBlock,
  };
}
