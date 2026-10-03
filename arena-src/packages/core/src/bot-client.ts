import { BotMind, applyEvent, rngFromSeed, type BotProfile, type MatchState } from "@arena/engine";
import type { ClientMessage, ServerMessage } from "@arena/protocol";
import type { Scheduler } from "./ports";

export interface BotClientOptions {
  readonly profile: BotProfile;
  /** Public seed for the bot's own decisions (never the match seed). */
  readonly seed: string;
  readonly scheduler: Scheduler;
  readonly send: (msg: ClientMessage) => void;
  /** Re-join the quick-match queue after each match (load testing). */
  readonly requeue?: { readonly delayMs: number } | null;
  /** Show attention (focus) on the card it is about to flip. */
  readonly showFocus?: boolean;
  /** Round trip from sending a flip to seeing the server's card_flipped for it. */
  readonly onFlipRtt?: (ms: number) => void;
  readonly onMatchFinished?: (state: MatchState) => void;
}

/**
 * A bot is just another protocol client. It mirrors the match by folding the public
 * event stream with the same reducer as the browser, so it can only know what it was
 * shown, then asks its BotMind what to flip. The same class drives the in-process
 * opponents (server and Web Worker) and the load-test clients over real WebSockets.
 */
export class BotClient {
  playerId: string | null = null;
  state: MatchState | null = null;
  private mind: BotMind;
  private timer: unknown = null;
  private inflight: { card: number; sentAt: number } | null = null;
  private refCounter = 0;
  private stopped = false;

  constructor(private readonly opts: BotClientOptions) {
    this.mind = new BotMind(opts.profile, rngFromSeed(opts.seed));
  }

  stop(): void {
    this.stopped = true;
    this.cancel();
  }

  receive(msg: ServerMessage): void {
    if (this.stopped) return;
    switch (msg.type) {
      case "welcome":
        this.playerId = msg.playerId;
        break;
      case "match_snapshot":
        if (msg.you !== this.playerId) return;
        if (this.state?.matchId !== msg.match.matchId) this.mind = new BotMind(this.opts.profile, rngFromSeed(`${this.opts.seed}:${msg.match.matchId}`));
        this.state = msg.match;
        this.inflight = null;
        this.plan();
        break;
      case "match_event": {
        const s = this.state;
        if (!s || msg.matchId !== s.matchId) return;
        if (msg.seq !== s.seq + 1) {
          // A gap means we missed something: ask for a fresh snapshot rather than guess.
          if (msg.seq > s.seq + 1) this.opts.send({ type: "sync", matchId: s.matchId });
          return;
        }
        const e = msg.event;
        this.state = applyEvent(s, e);
        if (e.type === "card_flipped") {
          this.mind.observe(e.card, e.value, e.at);
          if (e.playerId === this.playerId && this.inflight?.card === e.card) {
            this.opts.onFlipRtt?.(this.opts.scheduler.monotonic() - this.inflight.sentAt);
            this.inflight = null;
          }
        } else if (e.type === "triple_claimed") {
          for (const c of e.cards) this.mind.forget(c);
        } else if (e.type === "match_finished") {
          this.cancel();
          this.opts.onMatchFinished?.(this.state);
          if (this.opts.requeue) {
            const { delayMs } = this.opts.requeue;
            this.opts.scheduler.setTimeout(() => !this.stopped && this.opts.send({ type: "queue_join" }), delayMs);
          }
          return;
        }
        this.plan();
        break;
      }
      case "error":
        if (this.inflight && (msg.ref === undefined || msg.ref === this.refCounter)) {
          this.inflight = null;
          this.plan();
        }
        break;
      default:
        break;
    }
  }

  private plan(): void {
    const s = this.state;
    if (this.stopped || this.timer !== null || this.inflight || !s || s.status !== "active" || !this.playerId) return;
    const self = s.players.find((p) => p.id === this.playerId);
    if (!self || self.resolvingUntil !== null || self.selection.length >= 3) return;

    const { scheduler } = this.opts;
    const target = this.mind.chooseCard(s, self.id, scheduler.now());
    if (target === null) {
      // Everything left is in someone's hands: look again shortly.
      this.timer = scheduler.setTimeout(() => {
        this.timer = null;
        this.plan();
      }, 250);
      return;
    }
    if (this.opts.showFocus) this.opts.send({ type: "focus", matchId: s.matchId, card: target });
    this.timer = scheduler.setTimeout(() => {
      this.timer = null;
      this.act(target);
    }, this.mind.thinkDelay());
  }

  private act(planned: number): void {
    const s = this.state;
    if (this.stopped || !s || s.status !== "active" || !this.playerId) return;
    const self = s.players.find((p) => p.id === this.playerId);
    if (!self || self.resolvingUntil !== null || self.selection.length >= 3) return;
    // The planned card may have been taken while we "thought"; re-decide if so.
    const card = s.cards[planned]?.status === "down" ? planned : this.mind.chooseCard(s, self.id, this.opts.scheduler.now());
    if (card === null) return this.plan();
    this.refCounter = (this.refCounter + 1) % 2 ** 31;
    this.inflight = { card, sentAt: this.opts.scheduler.monotonic() };
    this.opts.send({ type: "flip", matchId: s.matchId, card, ref: this.refCounter });
  }

  private cancel(): void {
    if (this.timer !== null) this.opts.scheduler.clearTimeout(this.timer);
    this.timer = null;
    this.inflight = null;
  }
}
