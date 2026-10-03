import { applyEvent, type BotLevel, type MatchState, type MatchSummary, type PublicMatchEvent, type StoredEvent } from "@arena/engine";
import type { ClientMessage, ErrorCode, LadderEntry, LiveMatchInfo, RatingChange, RoomView, ServerInfo, ServerMessage } from "@arena/protocol";
import { PROTOCOL_VERSION, ROOM_CODE_ALPHABET } from "@arena/protocol";
import { screenCardLimit } from "../ui/format";
import { SocketTransport, WorkerTransport, type LinkStatus, type Transport } from "../net/transport";

export interface Presence {
  readonly focus: number | null;
  readonly connected: boolean;
}

export interface Toast {
  readonly id: number;
  readonly code: ErrorCode;
  readonly message: string;
}

export interface ClientState {
  readonly link: LinkStatus;
  readonly mode: "local" | "remote";
  readonly serverLabel: string;
  readonly me: { readonly playerId: string; readonly name: string; readonly rating: number } | null;
  readonly server: ServerInfo | null;
  /** serverTime - Date.now(), refined by ping. */
  readonly clockOffset: number;
  readonly rttMs: number | null;
  readonly room: RoomView | null;
  readonly queue: { readonly searching: boolean; readonly waiting: number; readonly since: number | null };
  readonly match: MatchState | null;
  /** My seat in `match`; null while spectating. */
  readonly you: string | null;
  /** Public events of the current match as they arrived (results chart, feed, verification). */
  readonly events: readonly PublicMatchEvent[];
  readonly presence: Readonly<Record<string, Presence>>;
  readonly summary: { readonly summary: MatchSummary; readonly ratings: readonly RatingChange[] } | null;
  readonly live: readonly LiveMatchInfo[];
  readonly replays: readonly MatchSummary[];
  readonly ladder: readonly LadderEntry[];
  readonly replay: { readonly matchId: string; readonly events: readonly StoredEvent[] } | null;
  readonly toasts: readonly Toast[];
}

const NAME_KEY = "arena.name";
const TOKEN_KEY = (mode: string) => `arena.token.${mode}`;
export const SERVER_KEY = "arena.server";

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* storage blocked: fine, just not remembered */
    }
  },
};

/** Where to connect: ?server=, then the saved setting, then the build-time default; none = Local Arena. */
export function configuredServer(): string | null {
  const fromQuery = new URLSearchParams(location.search).get("server");
  const url = fromQuery ?? store.get(SERVER_KEY) ?? (import.meta.env.VITE_ARENA_SERVER_URL as string | undefined) ?? null;
  return url && /^wss?:\/\/.+/.test(url) ? url : null;
}

export function saveServer(url: string | null): void {
  store.set(SERVER_KEY, url);
}

function defaultName(): string {
  const saved = store.get(NAME_KEY);
  if (saved) return saved;
  const n = `Player ${Math.floor(1000 + Math.random() * 9000)}`;
  store.set(NAME_KEY, n);
  return n;
}

type Listener = () => void;
type EventListener = (event: PublicMatchEvent, state: MatchState) => void;

/**
 * Client-side mirror of the arena. It never decides anything: it folds the server's
 * public events with the engine's reducer (the same one the server uses) and exposes
 * an immutable snapshot for React's useSyncExternalStore.
 */
/** Routing key for the quick-match queue (see infra/k8s/ingress.yaml). */
export const QUICK_ROUTE = "quick";

export class ArenaClient {
  private state: ClientState;
  private readonly listeners = new Set<Listener>();
  private readonly eventListeners = new Set<EventListener>();
  private readonly transport: Transport;
  private pingTimer: number | null = null;
  private toastId = 0;
  private name: string;
  /** Messages each way, for the protocol panel; kept out of the render snapshot. */
  readonly counters = { sent: 0, received: 0 };
  /** Sent after the next welcome (used when rerouting to a room's replica). */
  private pending: ClientMessage | null = null;

  constructor(serverUrl: string | null) {
    this.transport = serverUrl ? new SocketTransport(serverUrl) : new WorkerTransport();
    this.name = defaultName();
    this.state = {
      link: "connecting",
      mode: this.transport.kind,
      serverLabel: this.transport.label,
      me: null,
      server: null,
      clockOffset: 0,
      rttMs: null,
      room: null,
      queue: { searching: false, waiting: 0, since: null },
      match: null,
      you: null,
      events: [],
      presence: {},
      summary: null,
      live: [],
      replays: [],
      ladder: [],
      replay: null,
      toasts: [],
    };
    this.transport.onStatus((link) => {
      this.patch(link === "open" ? { link } : { link, me: link === "closed" ? null : this.state.me });
      if (link === "open") this.hello();
    });
    this.transport.onMessage((m) => this.receive(m));
    this.pingTimer = window.setInterval(() => this.send({ type: "ping", t: performance.now() }), 5000);
  }

  // ---------------------------------------------------------------- store API

  readonly subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  readonly getState = (): ClientState => this.state;

  /** Fires for each live match event after it is applied (animations hook in here). */
  onEvent(fn: EventListener): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  /** Server time now, from the local clock and the measured offset. */
  now(): number {
    return Date.now() + this.state.clockOffset;
  }

  destroy(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.transport.close();
  }

  // ---------------------------------------------------------------- intents

  send(msg: ClientMessage): void {
    this.transport.send(msg);
    this.counters.sent++;
  }

  setName(name: string): void {
    this.name = name;
    store.set(NAME_KEY, name);
    this.send({ type: "set_name", name });
    if (this.state.me) this.patch({ me: { ...this.state.me, name } });
  }

  /** The quick-match queue has its own routing key, so every queued player meets on one replica. */
  quickMatch(botLevel: BotLevel): void {
    this.viaRoute(QUICK_ROUTE, { type: "queue_join", botLevel });
  }

  createRoom(): void {
    const local = this.transport.kind === "local";
    const code = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
    const cardCount = Math.min(18, screenCardLimit(innerWidth, innerHeight));
    this.viaRoute(code, { type: "create_room", cardCount, maxPlayers: local ? 3 : 4, bots: local ? 2 : 0, botLevel: "adept", code });
  }

  joinRoom(code: string): void {
    this.viaRoute(code, { type: "join_room", code });
  }

  /**
   * Remote: reconnect with the routing key (room code, or the quick-match key) first, so a
   * load balancer hashing on it puts everyone who must meet on the same replica; then act
   * once re-welcomed. The resume token is valid on any replica.
   */
  private viaRoute(key: string, msg: ClientMessage): void {
    this.clearMatch();
    if (this.transport.kind === "remote") {
      this.pending = msg;
      this.transport.route(key);
      if (this.state.link === "open" && this.state.me) {
        // Same route as before: no reconnect happened, send right away.
        const queued = this.pending;
        this.pending = null;
        if (queued) this.send(queued);
      }
    } else this.send(msg);
  }

  flip(card: number): void {
    const m = this.state.match;
    if (m && this.state.you) this.send({ type: "flip", matchId: m.matchId, card });
  }

  focus(card: number | null): void {
    const m = this.state.match;
    if (m && this.state.you && m.status !== "finished") this.send({ type: "focus", matchId: m.matchId, card });
  }

  /** Leave the match screen; walks away from a live match (abandons it if nobody else is human). */
  leaveMatch(): void {
    const m = this.state.match;
    if (m && m.status !== "finished") this.send({ type: "leave_match", matchId: m.matchId });
    this.clearMatch();
  }

  clearMatch(): void {
    this.patch({ match: null, you: null, events: [], presence: {}, summary: null });
  }

  dismissToast(id: number): void {
    this.patch({ toasts: this.state.toasts.filter((t) => t.id !== id) });
  }

  // ---------------------------------------------------------------- protocol

  private hello(): void {
    const token = store.get(TOKEN_KEY(this.transport.kind));
    this.send({ type: "hello", protocol: PROTOCOL_VERSION, name: this.name, ...(token ? { token } : {}) });
    this.send({ type: "ping", t: performance.now() });
    this.send({ type: "get_ladder", limit: 20 });
    this.send({ type: "list_replays", limit: 8 });
    this.send({ type: "list_live" });
  }

  private receive(m: ServerMessage): void {
    const s = this.state;
    this.counters.received++;
    switch (m.type) {
      case "welcome":
        store.set(TOKEN_KEY(this.transport.kind), m.token);
        if (this.pending) {
          const queued = this.pending;
          this.pending = null;
          queueMicrotask(() => this.send(queued));
        }
        return this.patch({ me: { playerId: m.playerId, name: m.name, rating: m.rating }, server: m.server, clockOffset: m.serverTime - Date.now() });
      case "pong": {
        const rtt = performance.now() - m.t;
        return this.patch({ rttMs: rtt, clockOffset: m.serverTime + rtt / 2 - Date.now() });
      }
      case "room":
        return this.patch({ room: m.room });
      case "queue":
        return this.patch({ queue: { searching: m.searching, waiting: m.waiting, since: m.since } });
      case "match_snapshot": {
        const same = s.match?.matchId === m.match.matchId;
        return this.patch({
          match: m.match,
          you: m.you,
          events: same ? s.events : [],
          presence: same ? s.presence : {},
          summary: same ? s.summary : null,
          replay: null,
        });
      }
      case "match_event": {
        if (!s.match || s.match.matchId !== m.matchId) return;
        if (m.seq !== s.match.seq + 1) {
          // Missed something (should not happen on an ordered transport): resync rather than guess.
          if (m.seq > s.match.seq + 1) this.send({ type: "sync", matchId: m.matchId });
          return;
        }
        const match = applyEvent(s.match, m.event);
        this.patch({ match, events: [...s.events, m.event] });
        for (const fn of this.eventListeners) fn(m.event, match);
        if (m.event.type === "match_finished") {
          this.send({ type: "get_ladder", limit: 20 });
          this.send({ type: "list_replays", limit: 8 });
        }
        return;
      }
      case "presence":
        if (s.match?.matchId !== m.matchId) return;
        return this.patch({ presence: { ...s.presence, [m.playerId]: { focus: m.focus, connected: m.connected } } });
      case "match_summary": {
        const mine = m.ratings.find((r) => r.playerId === s.me?.playerId);
        return this.patch({
          summary: s.match?.matchId === m.summary.matchId ? { summary: m.summary, ratings: m.ratings } : s.summary,
          me: mine && s.me ? { ...s.me, rating: mine.after } : s.me,
        });
      }
      case "live_list":
        return this.patch({ live: m.matches });
      case "replay_list":
        return this.patch({ replays: m.replays });
      case "replay":
        return this.patch({ replay: { matchId: m.matchId, events: m.events } });
      case "ladder":
        return this.patch({ ladder: m.entries });
      case "error": {
        // Quiet ones: racing for a card someone just took is part of the game.
        if (m.code === "card_unavailable" || m.code === "resolving" || m.code === "not_active" || m.code === "time_up") return;
        const toast: Toast = { id: ++this.toastId, code: m.code, message: m.message };
        window.setTimeout(() => this.dismissToast(toast.id), 4000);
        return this.patch({ toasts: [...s.toasts.slice(-2), toast] });
      }
    }
  }

  private patch(p: Partial<ClientState>): void {
    this.state = { ...this.state, ...p };
    for (const fn of this.listeners) fn();
  }
}
