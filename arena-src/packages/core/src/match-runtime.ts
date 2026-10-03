import {
  applyEvent,
  decideAbandon,
  decideClear,
  decideFlip,
  decideStalemate,
  decideStart,
  decideTimeout,
  isStalemate,
  summarize,
  toPublicEvent,
  toPublicView,
  type MatchCreated,
  type MatchEvent,
  type MatchFinished,
  type MatchState,
  type MatchSummary,
  type RejectCode,
  type StoredEvent,
} from "@arena/engine";
import type { LiveMatchInfo } from "@arena/protocol";
import { frame, type Frame, type Logger, type Scheduler } from "./ports";
import { ConcurrencyError, type EventStore } from "./store";
import type { ArenaMetrics } from "./arena-metrics";

export interface RuntimeContext {
  readonly scheduler: Scheduler;
  readonly store: EventStore;
  readonly metrics: ArenaMetrics;
  readonly logger: Logger;
  /** Deliver a frame to these players' current connections, if any. */
  deliver(playerIds: Iterable<string>, frame: Frame): void;
  /** Called once, after the whole log (including match_finished) is durable. */
  onFinished(runtime: MatchRuntime, summary: MatchSummary): void;
}

/**
 * One live match on the authoritative server. Commands go through the engine's
 * decide* functions; accepted events are folded into the state, streamed to the
 * audience, and appended to the store in order (write-behind, batched per tick).
 * The runtime owns every timer that turns into an event: start, mismatch reveal,
 * idle release and the final whistle.
 */
export class MatchRuntime {
  private state: MatchState;
  private readonly pending: StoredEvent[] = [];
  private flushQueued = false;
  private flushChain: Promise<void> = Promise.resolve();
  private readonly timers = new Map<string, unknown>();
  private readonly focus = new Map<string, number | null>();
  private readonly lastFocusAt = new Map<string, number>();
  readonly spectators = new Set<string>();
  readonly connected = new Map<string, boolean>();
  private finishing = false;

  constructor(
    created: MatchCreated,
    private readonly ctx: RuntimeContext,
  ) {
    this.state = applyEvent(null, created);
    this.pending.push({ matchId: created.matchId, seq: 0, event: created });
    for (const p of created.players) this.connected.set(p.id, true);
    this.scheduleFlush();
    this.setTimer("start", Math.max(0, created.startsAt - ctx.scheduler.now()), () => this.run(decideStart(this.state, this.ctx.scheduler.now())));
  }

  get id(): string {
    return this.state.matchId;
  }
  get finished(): boolean {
    return this.state.status === "finished";
  }
  /** The authoritative state, including the deck. Never send this to a client. */
  get authoritative(): MatchState {
    return this.state;
  }
  get playerIds(): string[] {
    return this.state.players.map((p) => p.id);
  }
  isPlayer(playerId: string): boolean {
    return this.state.players.some((p) => p.id === playerId);
  }

  snapshot(): MatchState {
    return toPublicView(this.state);
  }

  info(): LiveMatchInfo {
    const s = this.state;
    return {
      matchId: s.matchId,
      mode: s.mode,
      status: s.status,
      cardCount: s.cardCount,
      triplesLeft: s.triplesLeft,
      endsAt: s.endsAt,
      spectators: this.spectators.size,
      players: s.players.map((p) => ({ name: p.name, kind: p.kind, seat: p.seat, score: p.score, triples: p.triples })),
    };
  }

  // ------------------------------------------------------------ commands

  flip(playerId: string, card: number): RejectCode | null {
    const t0 = this.ctx.scheduler.monotonic();
    const decision = decideFlip(this.state, playerId, card, this.ctx.scheduler.now());
    if (!decision.ok) return decision.code;
    this.commit(decision.events);
    this.ctx.metrics.flipHandleMs.observe(this.ctx.scheduler.monotonic() - t0);
    return null;
  }

  /** Ephemeral attention signal; throttled, never logged. */
  setFocus(playerId: string, card: number | null, minIntervalMs: number): void {
    if (!this.isPlayer(playerId) || this.finished) return;
    if (card !== null && (card < 0 || card >= this.state.cardCount)) return;
    const now = this.ctx.scheduler.now();
    if (now - (this.lastFocusAt.get(playerId) ?? 0) < minIntervalMs && card !== null) return;
    if (this.focus.get(playerId) === card) return;
    this.lastFocusAt.set(playerId, now);
    this.focus.set(playerId, card);
    this.ctx.deliver(this.audience(playerId), frame(this.presenceMessage(playerId)));
  }

  setConnected(playerId: string, connected: boolean): void {
    if (!this.isPlayer(playerId) || this.connected.get(playerId) === connected) return;
    this.connected.set(playerId, connected);
    if (!connected) this.focus.set(playerId, null);
    this.ctx.deliver(this.audience(playerId), frame(this.presenceMessage(playerId)));
  }

  presenceFrames(): Frame[] {
    return this.state.players.map((p) => frame(this.presenceMessage(p.id)));
  }

  abandon(): void {
    this.run(decideAbandon(this.state, this.ctx.scheduler.now()));
  }

  /** Everyone who receives this match's stream (players and spectators). */
  audience(except?: string): string[] {
    const ids = [...this.playerIds, ...this.spectators];
    return except ? ids.filter((id) => id !== except) : ids;
  }

  /** Resolves once everything committed so far is durable. */
  flushed(): Promise<void> {
    return this.flush();
  }

  // ------------------------------------------------------------ internals

  private presenceMessage(playerId: string) {
    return { type: "presence", matchId: this.id, playerId, focus: this.focus.get(playerId) ?? null, connected: this.connected.get(playerId) ?? false } as const;
  }

  private run(decision: ReturnType<typeof decideStart>): void {
    if (decision.ok) this.commit(decision.events);
  }

  private commit(events: readonly MatchEvent[]): void {
    for (const event of events) {
      this.state = applyEvent(this.state, event);
      const seq = this.state.seq;
      this.pending.push({ matchId: this.id, seq, event });
      this.ctx.metrics.events.inc({ type: event.type });
      const pub = toPublicEvent(event);
      if (pub) this.ctx.deliver(this.audience(), frame({ type: "match_event", matchId: this.id, seq, event: pub }));
      this.schedule(event);
    }
    if (isStalemate(this.state) && !this.timers.has("stalemate")) {
      this.setTimer("stalemate", this.state.rules.timing.stalemateReleaseMs, () => this.run(decideStalemate(this.state, this.ctx.scheduler.now())));
    }
    this.scheduleFlush();
  }

  private schedule(event: MatchEvent): void {
    const { scheduler } = this.ctx;
    switch (event.type) {
      case "match_started":
        this.setTimer("end", Math.max(0, event.endsAt - scheduler.now()), () => this.run(decideTimeout(this.state, Math.max(scheduler.now(), event.endsAt))));
        break;
      case "card_flipped": {
        const p = this.state.players.find((x) => x.id === event.playerId);
        if (p && p.selection.length < 3 && p.resolvingUntil === null) {
          const idle = this.state.rules.timing.idleReleaseMs;
          this.setTimer(`p:${p.id}`, idle, () => this.run(decideClear(this.state, p.id, "idle", scheduler.now())));
        }
        break;
      }
      case "triple_claimed":
        this.clearTimer(`p:${event.playerId}`);
        break;
      case "triple_failed": {
        const reveal = this.state.rules.timing.mismatchRevealMs;
        this.setTimer(`p:${event.playerId}`, reveal, () => this.run(decideClear(this.state, event.playerId, "mismatch", scheduler.now())));
        break;
      }
      case "selection_cleared":
        this.clearTimer(`p:${event.playerId}`);
        break;
      case "match_finished":
        for (const key of [...this.timers.keys()]) this.clearTimer(key);
        void this.finish(event);
        break;
      case "match_created":
        break;
    }
  }

  private async finish(event: MatchFinished): Promise<void> {
    if (this.finishing) return;
    this.finishing = true;
    await this.flush();
    this.ctx.onFinished(this, summarize(this.id, event));
  }

  private setTimer(key: string, ms: number, fn: () => void): void {
    this.clearTimer(key);
    this.timers.set(
      key,
      this.ctx.scheduler.setTimeout(() => {
        this.timers.delete(key);
        if (!this.finished) fn();
      }, ms),
    );
  }

  private clearTimer(key: string): void {
    const handle = this.timers.get(key);
    if (handle !== undefined) this.ctx.scheduler.clearTimeout(handle);
    this.timers.delete(key);
  }

  private scheduleFlush(): void {
    if (this.flushQueued) return;
    this.flushQueued = true;
    // One append per burst of events (a flip can emit three), after the current task.
    void Promise.resolve().then(() => this.flush());
  }

  private flush(): Promise<void> {
    this.flushQueued = false;
    const batch = this.pending.splice(0);
    if (batch.length > 0) this.flushChain = this.flushChain.then(() => this.append(batch));
    return this.flushChain;
  }

  private async append(batch: StoredEvent[]): Promise<void> {
    const { store, metrics, logger, scheduler } = this.ctx;
    for (let attempt = 0; ; attempt++) {
      const t0 = scheduler.monotonic();
      try {
        await store.append(this.id, (batch[0] as StoredEvent).seq, batch);
        metrics.storeAppendMs.observe(scheduler.monotonic() - t0);
        return;
      } catch (err) {
        if (err instanceof ConcurrencyError || attempt >= 3) {
          metrics.storeFailures.inc();
          logger.error("event append failed", { matchId: this.id, seq: batch[0]?.seq, error: String(err) });
          return;
        }
        await new Promise<void>((resolve) => scheduler.setTimeout(resolve, 50 * 2 ** attempt));
      }
    }
  }
}
