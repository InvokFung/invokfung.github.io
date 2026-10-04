import type { BotLevel } from "@arena/engine";

export interface QueueEntry {
  readonly playerId: string;
  readonly since: number;
  readonly botLevel: BotLevel;
}

export interface QueuePolicy {
  /** Largest table; a full table starts immediately. */
  readonly tableSize: number;
  /** Start with whoever is waiting (2+) once the oldest has waited this long. */
  readonly fillAfterMs: number;
  /** A lone player gets bot opponents after this long; null disables bot fill. */
  readonly botFillAfterMs: number | null;
}

/** FIFO quick-match queue. `take` is a pure function of the queue, the clock and the policy. */
export class Matchmaker {
  private readonly entries: QueueEntry[] = [];

  get size(): number {
    return this.entries.length;
  }

  has(playerId: string): boolean {
    return this.entries.some((e) => e.playerId === playerId);
  }

  oldest(): QueueEntry | undefined {
    return this.entries[0];
  }

  join(entry: QueueEntry): boolean {
    if (this.has(entry.playerId)) return false;
    this.entries.push(entry);
    return true;
  }

  leave(playerId: string): boolean {
    const i = this.entries.findIndex((e) => e.playerId === playerId);
    if (i < 0) return false;
    this.entries.splice(i, 1);
    return true;
  }

  take(now: number, policy: QueuePolicy): QueueEntry[][] {
    const groups: QueueEntry[][] = [];
    while (this.entries.length >= policy.tableSize) groups.push(this.entries.splice(0, policy.tableSize));
    const head = this.entries[0];
    if (!head) return groups;
    const waited = now - head.since;
    if (this.entries.length >= 2 && waited >= policy.fillAfterMs) groups.push(this.entries.splice(0));
    else if (this.entries.length === 1 && policy.botFillAfterMs !== null && waited >= policy.botFillAfterMs) groups.push(this.entries.splice(0));
    return groups;
  }
}
