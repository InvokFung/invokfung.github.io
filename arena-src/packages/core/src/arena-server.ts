import {
  BOT_PROFILES,
  CLASSIC_RULES,
  createMatch,
  isValidCardCount,
  quickMatchCardCount,
  type BotLevel,
  type MatchPlayerInfo,
  type MatchSummary,
  type PlayerKind,
  type Rules,
} from "@arena/engine";
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  sanitizeName,
  type ClientMessage,
  type ClientMessageOf,
  type ErrorCode,
  type RoomMember,
  type RoomSettings,
  type RoomView,
  type ServerMessage,
} from "@arena/protocol";
import { ArenaMetrics } from "./arena-metrics";
import { BotClient } from "./bot-client";
import { newId, newRoomCode, newSeed } from "./ids";
import { BOT_ANCHORS, Ladder } from "./ladder";
import { MatchRuntime } from "./match-runtime";
import { Matchmaker } from "./matchmaker";
import { frame, silentLogger, type Connection, type Frame, type Logger, type RandomSource, type Scheduler, type SessionAuthority } from "./ports";
import type { EventStore } from "./store";

export interface ArenaConfig {
  readonly server: { readonly kind: "node" | "worker"; readonly version: string; readonly instance: string };
  readonly rules: Rules;
  readonly queue: {
    readonly tickMs: number;
    readonly tableSize: number;
    readonly fillAfterMs: number;
    readonly botFillAfterMs: number | null;
    readonly botFillCount: number;
  };
  /** A disconnected player keeps their room seat this long. */
  readonly roomGraceMs: number;
  /** A match whose humans are all gone is abandoned (unrated) after this long. */
  readonly abandonAfterMs: number;
  readonly rateLimit: { readonly capacity: number; readonly refillPerSec: number; readonly maxStrikes: number };
  readonly focusMinIntervalMs: number;
  readonly limits: { readonly rooms: number; readonly matches: number; readonly messageBytes: number };
  readonly botFocus: boolean;
}

export const DEFAULT_CONFIG: ArenaConfig = {
  server: { kind: "node", version: "0.1.0", instance: "local" },
  rules: CLASSIC_RULES,
  queue: { tickMs: 250, tableSize: 4, fillAfterMs: 3000, botFillAfterMs: 8000, botFillCount: 2 },
  roomGraceMs: 30_000,
  abandonAfterMs: 20_000,
  rateLimit: { capacity: 40, refillPerSec: 20, maxStrikes: 20 },
  focusMinIntervalMs: 60,
  limits: { rooms: 5_000, matches: 2_500, messageBytes: 4_096 },
  botFocus: true,
};

export interface ArenaDeps {
  readonly store: EventStore;
  readonly scheduler: Scheduler;
  readonly random: RandomSource;
  readonly sessions: SessionAuthority;
  readonly logger?: Logger;
  readonly config?: Partial<ArenaConfig>;
}

interface Client {
  readonly conn: Connection;
  session: Session | null;
  tokens: number;
  refilledAt: number;
  strikes: number;
}

interface Session {
  readonly playerId: string;
  name: string;
  readonly kind: PlayerKind;
  readonly botLevel: BotLevel | null;
  client: Client | null;
  roomCode: string | null;
  matchId: string | null;
  watching: string | null;
  graceTimer: unknown;
  bot: BotClient | null;
}

interface Room {
  readonly code: string;
  hostId: string;
  status: "lobby" | "playing";
  settings: RoomSettings;
  readonly members: string[];
  matchId: string | null;
  lastMatchId: string | null;
}

const BOT_NAMES = ["Echo", "Pixel", "Tally", "Mnemo", "Glint", "Riff", "Juno", "Cobalt", "Quill", "Ripple"];

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  hello_required: "Say hello first.",
  rate_limited: "Too many messages; slow down.",
  not_found: "Not found.",
  room_full: "That room is full.",
  not_host: "Only the host can do that.",
  not_in_room: "You are not in a room.",
  busy: "Finish or leave what you are in first.",
  invalid_settings: "Those room settings are not allowed.",
  code_taken: "That room code is in use.",
  match_not_finished: "Replays open once the match is over.",
  not_active: "The match is not running.",
  time_up: "Time is up.",
  not_a_player: "You are not playing in this match.",
  bad_card: "No such card.",
  card_unavailable: "That card is not face down.",
  resolving: "Wait for your cards to flip back.",
  selection_full: "You already hold three cards.",
};

/**
 * The authoritative arena. Transport-agnostic: a host calls connect / receive /
 * disconnect for each client connection and supplies a clock, randomness, a session
 * authority and an event store. Clients only ever *ask*; every state change is
 * decided here (through the engine) and broadcast as events.
 */
export class ArenaServer {
  readonly config: ArenaConfig;
  readonly metrics: ArenaMetrics;
  private readonly store: EventStore;
  private readonly scheduler: Scheduler;
  private readonly random: RandomSource;
  private readonly authority: SessionAuthority;
  private readonly logger: Logger;
  private readonly clients = new Map<string, Client>();
  private readonly sessions = new Map<string, Session>();
  private readonly rooms = new Map<string, Room>();
  private readonly live = new Map<string, MatchRuntime>();
  private readonly abandonTimers = new Map<string, unknown>();
  private readonly queue = new Matchmaker();
  private queueTimer: unknown = null;
  private ladder = new Ladder();
  private ready = false;
  private draining = false;

  constructor(deps: ArenaDeps) {
    this.config = { ...DEFAULT_CONFIG, ...deps.config };
    this.store = deps.store;
    this.scheduler = deps.scheduler;
    this.random = deps.random;
    this.authority = deps.sessions;
    this.logger = deps.logger ?? silentLogger;
    this.metrics = new ArenaMetrics({
      connections: () => this.clients.size,
      rooms: () => this.rooms.size,
      matches: () => this.live.size,
      queue: () => this.queue.size,
    });
  }

  /** Rebuild projections from the event store, then accept traffic. */
  async start(): Promise<void> {
    const t0 = this.scheduler.monotonic();
    this.ladder = await Ladder.rebuild(this.store);
    this.ready = true;
    this.logger.info("arena ready", { store: this.store.kind, ladderPlayers: this.ladder.entries(1_000_000).length, rebuildMs: Math.round(this.scheduler.monotonic() - t0) });
  }

  /** Graceful shutdown: refuse new work, abandon live matches, persist, close sockets so clients reconnect elsewhere. */
  async stop(): Promise<void> {
    this.draining = true;
    this.ready = false;
    const runtimes = [...this.live.values()];
    for (const r of runtimes) r.abandon();
    await Promise.all(runtimes.map((r) => r.flushed()));
    for (const c of [...this.clients.values()]) c.conn.close(1012, "server restarting");
    if (this.queueTimer !== null) this.scheduler.clearTimeout(this.queueTimer);
  }

  isReady(): boolean {
    return this.ready && !this.draining;
  }

  stats() {
    return { connections: this.clients.size, rooms: this.rooms.size, matches: this.live.size, queue: this.queue.size, sessions: this.sessions.size };
  }

  // ------------------------------------------------------------ transport hooks

  connect(conn: Connection): void {
    this.clients.set(conn.id, { conn, session: null, tokens: this.config.rateLimit.capacity, refilledAt: this.scheduler.monotonic(), strikes: 0 });
  }

  /** Entry point for text transports (WebSocket). */
  receiveText(conn: Connection, text: string): void {
    const client = this.clients.get(conn.id);
    if (!client) return;
    if (text.length > this.config.limits.messageBytes) return this.reject(client, "bad_message", "Message too large.");
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return this.reject(client, "bad_message", "Malformed JSON.");
    }
    this.receive(conn, data);
  }

  /** Entry point for structured transports (postMessage, in-process bots). */
  receive(conn: Connection, data: unknown): void {
    const client = this.clients.get(conn.id);
    if (!client) return;
    if (!this.admit(client)) return;
    const parsed = parseClientMessage(data);
    if (!parsed.ok) return this.reject(client, "bad_message", `${parsed.issue.path}: ${parsed.issue.message}`);
    this.metrics.messagesIn.inc({ type: parsed.value.type });
    try {
      this.handle(client, parsed.value);
    } catch (err) {
      this.logger.error("handler failed", { type: parsed.value.type, error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
      this.reject(client, "internal", "Internal error.");
    }
  }

  disconnect(conn: Connection): void {
    const client = this.clients.get(conn.id);
    if (!client) return;
    this.clients.delete(conn.id);
    const session = client.session;
    if (!session || session.client !== client) return;
    session.client = null;
    this.leaveQueue(session, false);
    this.unwatch(session);
    const runtime = session.matchId ? this.live.get(session.matchId) : undefined;
    if (runtime) {
      runtime.setConnected(session.playerId, false);
      this.checkAbandon(runtime);
    }
    if (session.roomCode) this.broadcastRoom(session.roomCode);
    session.graceTimer = this.scheduler.setTimeout(() => this.expire(session), this.config.roomGraceMs);
  }

  // ------------------------------------------------------------ dispatch

  private handle(client: Client, msg: ClientMessage): void {
    if (msg.type === "hello") return this.onHello(client, msg);
    if (msg.type === "ping") return this.send(client, { type: "pong", t: msg.t, serverTime: this.scheduler.now() });
    const s = client.session;
    if (!s) return this.reject(client, "hello_required");
    switch (msg.type) {
      case "set_name":
        return this.onSetName(s, msg);
      case "create_room":
        return this.onCreateRoom(client, s, msg);
      case "update_room":
        return this.onUpdateRoom(client, s, msg);
      case "join_room":
        return this.onJoinRoom(client, s, msg);
      case "leave_room":
        return this.leaveRoom(s, true);
      case "start_match":
        return this.onStartMatch(client, s);
      case "queue_join":
        return this.onQueueJoin(client, s, msg);
      case "queue_leave":
        return this.leaveQueue(s, true);
      case "flip":
        return this.onFlip(client, s, msg);
      case "focus":
        return this.live.get(msg.matchId)?.setFocus(s.playerId, msg.card, this.config.focusMinIntervalMs);
      case "spectate":
        return this.onSpectate(client, s, msg.matchId);
      case "unwatch":
        return this.unwatch(s);
      case "sync":
        return this.onSync(client, s, msg.matchId);
      case "list_live":
        return this.send(client, { type: "live_list", matches: [...this.live.values()].filter((r) => !r.finished).slice(0, 20).map((r) => r.info()) });
      case "leave_match":
        return this.onLeaveMatch(s, msg.matchId);
      case "list_replays":
        return this.async(client, this.store.recentFinished(msg.limit ?? 12).then((replays) => this.send(client, { type: "replay_list", replays })));
      case "get_replay":
        return this.async(client, this.onGetReplay(client, msg.matchId));
      case "get_ladder":
        return this.send(client, { type: "ladder", entries: this.ladder.entries(msg.limit ?? 25) });
      default:
        return assertNever(msg);
    }
  }

  // ------------------------------------------------------------ sessions

  private onHello(client: Client, msg: ClientMessageOf<"hello">): void {
    if (msg.protocol !== PROTOCOL_VERSION) {
      this.reject(client, "protocol_mismatch", `Server speaks protocol ${PROTOCOL_VERSION}.`);
      return client.conn.close(4400, "protocol mismatch");
    }
    if (client.session) return this.reject(client, "bad_message", "Already greeted.");
    if (this.draining) return client.conn.close(1012, "server restarting");
    const name = sanitizeName(msg.name);
    const claimed = msg.token ? this.authority.verify(msg.token) : null;
    let session = claimed ? this.sessions.get(claimed) : undefined;
    if (session?.kind === "bot") session = undefined;
    if (!session) {
      session = this.newSession(claimed && claimed.startsWith("p_") ? claimed : newId(this.random, "p"), name, "human", null);
    }
    const previous = session.client;
    if (previous && previous !== client) {
      // Same identity on a new connection (reconnect, second tab): the newest wins.
      previous.session = null;
      this.reject(previous, "busy", "Signed in from another tab.");
      this.clients.delete(previous.conn.id);
      previous.conn.close(4001, "superseded");
    }
    if (session.graceTimer !== null) this.scheduler.clearTimeout(session.graceTimer);
    session.graceTimer = null;
    session.client = client;
    session.name = name;
    client.session = session;
    this.send(client, {
      type: "welcome",
      playerId: session.playerId,
      name,
      token: this.authority.issue(session.playerId),
      serverTime: this.scheduler.now(),
      server: { ...this.config.server, store: this.store.kind },
      rating: Math.round(this.ladder.rating(session.playerId)),
    });
    // Resume whatever this identity was doing.
    if (session.roomCode) this.broadcastRoom(session.roomCode);
    const runtime = session.matchId ? this.live.get(session.matchId) : undefined;
    if (runtime) {
      runtime.setConnected(session.playerId, true);
      this.checkAbandon(runtime);
      this.sendSnapshot(client, runtime, session.playerId);
    } else {
      session.matchId = null;
    }
  }

  private newSession(playerId: string, name: string, kind: PlayerKind, botLevel: BotLevel | null): Session {
    const s: Session = { playerId, name, kind, botLevel, client: null, roomCode: null, matchId: null, watching: null, graceTimer: null, bot: null };
    this.sessions.set(playerId, s);
    return s;
  }

  private onSetName(s: Session, msg: ClientMessageOf<"set_name">): void {
    s.name = sanitizeName(msg.name);
    if (s.roomCode) this.broadcastRoom(s.roomCode);
  }

  /** Grace period over: give up the room seat and forget an idle session. */
  private expire(s: Session): void {
    s.graceTimer = null;
    if (s.client) return;
    if (s.roomCode) this.leaveRoom(s, false);
    if (!s.matchId) this.sessions.delete(s.playerId);
  }

  private isBusy(s: Session): boolean {
    return s.roomCode !== null || s.matchId !== null || this.queue.has(s.playerId);
  }

  // ------------------------------------------------------------ rooms

  private onCreateRoom(client: Client, s: Session, msg: ClientMessageOf<"create_room">): void {
    if (this.isBusy(s)) return this.reject(client, "busy");
    if (this.rooms.size >= this.config.limits.rooms || this.draining) return this.reject(client, "busy", "The arena is at capacity.");
    const settings: RoomSettings = { cardCount: msg.cardCount, maxPlayers: msg.maxPlayers, bots: msg.bots, botLevel: msg.botLevel };
    if (!this.validSettings(settings, 1)) return this.reject(client, "invalid_settings");
    let code = msg.code;
    if (code && this.rooms.has(code)) return this.reject(client, "code_taken");
    while (!code || this.rooms.has(code)) code = newRoomCode(this.random);
    this.rooms.set(code, { code, hostId: s.playerId, status: "lobby", settings, members: [s.playerId], matchId: null, lastMatchId: null });
    s.roomCode = code;
    this.broadcastRoom(code);
  }

  private onUpdateRoom(client: Client, s: Session, msg: ClientMessageOf<"update_room">): void {
    const room = s.roomCode ? this.rooms.get(s.roomCode) : undefined;
    if (!room) return this.reject(client, "not_in_room");
    if (room.hostId !== s.playerId) return this.reject(client, "not_host");
    if (room.status !== "lobby") return this.reject(client, "busy", "A match is running.");
    const next: RoomSettings = {
      cardCount: msg.cardCount ?? room.settings.cardCount,
      maxPlayers: msg.maxPlayers ?? room.settings.maxPlayers,
      bots: msg.bots ?? room.settings.bots,
      botLevel: msg.botLevel ?? room.settings.botLevel,
    };
    if (!this.validSettings(next, room.members.length)) return this.reject(client, "invalid_settings");
    room.settings = next;
    this.broadcastRoom(room.code);
  }

  private validSettings(st: RoomSettings, humans: number): boolean {
    return isValidCardCount(st.cardCount, this.config.rules) && st.maxPlayers <= this.config.rules.players.max && humans + st.bots <= st.maxPlayers;
  }

  private onJoinRoom(client: Client, s: Session, msg: ClientMessageOf<"join_room">): void {
    const room = this.rooms.get(msg.code);
    if (!room) return this.reject(client, "not_found", "No room with that code.");
    if (room.members.includes(s.playerId)) return this.broadcastRoom(room.code);
    if (this.isBusy(s)) return this.reject(client, "busy");
    if (room.members.length + room.settings.bots >= room.settings.maxPlayers) return this.reject(client, "room_full");
    room.members.push(s.playerId);
    s.roomCode = room.code;
    this.broadcastRoom(room.code);
    // Joined mid-match: watch it until the next round.
    if (room.matchId) this.onSpectate(client, s, room.matchId);
  }

  private leaveRoom(s: Session, notify: boolean): void {
    const room = s.roomCode ? this.rooms.get(s.roomCode) : undefined;
    s.roomCode = null;
    if (notify && s.client) this.send(s.client, { type: "room", room: null });
    if (!room) return;
    room.members.splice(room.members.indexOf(s.playerId), 1);
    if (room.members.length === 0) {
      this.rooms.delete(room.code);
      return;
    }
    if (room.hostId === s.playerId) room.hostId = room.members.find((id) => this.sessions.get(id)?.client) ?? (room.members[0] as string);
    this.broadcastRoom(room.code);
  }

  private onStartMatch(client: Client, s: Session): void {
    const room = s.roomCode ? this.rooms.get(s.roomCode) : undefined;
    if (!room) return this.reject(client, "not_in_room");
    if (room.hostId !== s.playerId) return this.reject(client, "not_host");
    if (room.status !== "lobby") return this.reject(client, "busy", "A match is already running.");
    if (this.live.size >= this.config.limits.matches || this.draining) return this.reject(client, "busy", "The arena is at capacity.");
    const humans = room.members.map((id) => this.sessions.get(id)).filter((x): x is Session => !!x && x.matchId === null);
    const bots = Array.from({ length: room.settings.bots }, () => room.settings.botLevel);
    this.launch(humans, bots, "room", room.settings.cardCount, room);
  }

  private roomView(room: Room): RoomView {
    const members: RoomMember[] = room.members.map((id) => {
      const m = this.sessions.get(id);
      return { id, name: m?.name ?? "?", kind: "human", botLevel: null, connected: !!m?.client, rating: Math.round(this.ladder.rating(id)) };
    });
    for (let i = 0; i < room.settings.bots; i++) {
      const level = room.settings.botLevel;
      members.push({ id: `bot-slot-${i}`, name: `${BOT_PROFILES[level].label} bot`, kind: "bot", botLevel: level, connected: true, rating: BOT_ANCHORS[level] });
    }
    return { code: room.code, quick: false, hostId: room.hostId, status: room.status, settings: room.settings, members, matchId: room.matchId, lastMatchId: room.lastMatchId };
  }

  private broadcastRoom(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    const f = frame({ type: "room", room: this.roomView(room) });
    this.deliver(room.members, f);
  }

  // ------------------------------------------------------------ quick match

  private onQueueJoin(client: Client, s: Session, msg: ClientMessageOf<"queue_join">): void {
    if (this.isBusy(s)) return this.reject(client, "busy");
    if (this.draining) return this.reject(client, "busy", "The arena is restarting.");
    this.queue.join({ playerId: s.playerId, since: this.scheduler.now(), botLevel: msg.botLevel ?? "adept" });
    this.unwatch(s);
    this.sendQueueState();
    this.tickQueue();
  }

  private leaveQueue(s: Session, notify: boolean): void {
    if (!this.queue.leave(s.playerId)) {
      if (notify && s.client) this.send(s.client, { type: "queue", searching: false, waiting: this.queue.size, since: null });
      return;
    }
    if (notify && s.client) this.send(s.client, { type: "queue", searching: false, waiting: this.queue.size, since: null });
    this.sendQueueState();
  }

  private sendQueueState(): void {
    const head = this.queue.oldest();
    for (const s of this.sessions.values()) {
      if (s.client && this.queue.has(s.playerId)) this.send(s.client, { type: "queue", searching: true, waiting: this.queue.size, since: head?.since ?? null });
    }
  }

  private tickQueue(): void {
    if (this.queueTimer !== null) {
      this.scheduler.clearTimeout(this.queueTimer);
      this.queueTimer = null;
    }
    const q = this.config.queue;
    for (const group of this.queue.take(this.scheduler.now(), { tableSize: q.tableSize, fillAfterMs: q.fillAfterMs, botFillAfterMs: q.botFillAfterMs })) {
      const humans = group.map((e) => this.sessions.get(e.playerId)).filter((x): x is Session => !!x && x.client !== null);
      if (humans.length === 0) continue;
      const bots = humans.length === 1 ? Array.from({ length: q.botFillCount }, () => group[0]?.botLevel ?? "adept") : [];
      this.launch(humans, bots, "quick", quickMatchCardCount(humans.length + bots.length), null);
    }
    if (this.queue.size > 0) {
      this.sendQueueState();
      this.queueTimer = this.scheduler.setTimeout(() => this.tickQueue(), q.tickMs);
    }
  }

  // ------------------------------------------------------------ matches

  private launch(humans: Session[], botLevels: BotLevel[], mode: "quick" | "room", cardCount: number, room: Room | null): void {
    if (humans.length + botLevels.length > this.config.rules.players.max || humans.length === 0) return;
    const matchId = newId(this.random, "m");
    const usedNames = new Set(humans.map((h) => h.name));
    const bots = botLevels.map((level) => {
      const name = BOT_NAMES.filter((n) => !usedNames.has(n))[this.random.bytes(1)[0] as number % 6] ?? "Bot";
      usedNames.add(name);
      return this.spawnBot(level, name);
    });
    const seats = [...humans, ...bots];
    const players: MatchPlayerInfo[] = seats.map((s, seat) => ({ id: s.playerId, name: s.name, kind: s.kind, seat, botLevel: s.botLevel }));
    const created = createMatch({ matchId, mode, seed: newSeed(this.random), cardCount, players, now: this.scheduler.now(), rules: this.config.rules });
    const runtime = new MatchRuntime(created, {
      scheduler: this.scheduler,
      store: this.store,
      metrics: this.metrics,
      logger: this.logger,
      deliver: (ids, f) => this.deliver(ids, f),
      onFinished: (r, summary) => this.onFinished(r, summary, room?.code ?? null),
    });
    this.live.set(matchId, runtime);
    for (const s of seats) {
      this.queue.leave(s.playerId);
      this.unwatch(s);
      s.matchId = matchId;
      if (!s.client) runtime.setConnected(s.playerId, false);
    }
    if (room) {
      room.status = "playing";
      room.matchId = matchId;
      this.broadcastRoom(room.code);
    }
    for (const s of seats) if (s.client) this.sendSnapshot(s.client, runtime, s.playerId);
    if (mode === "quick") for (const h of humans) if (h.client) this.send(h.client, { type: "queue", searching: false, waiting: this.queue.size, since: null });
    this.logger.info("match created", { matchId, mode, cardCount, players: seats.length, bots: bots.length });
  }

  private spawnBot(level: BotLevel, name: string): Session {
    const session = this.newSession(newId(this.random, "b"), name, "bot", level);
    const conn: Connection = {
      id: `bot:${session.playerId}`,
      send: (f) => bot.receive(f.message),
      close: () => bot.stop(),
    };
    const bot = new BotClient({
      profile: BOT_PROFILES[level],
      seed: session.playerId,
      scheduler: this.scheduler,
      showFocus: this.config.botFocus,
      // Bots go through the same validation and rate limits as everyone else, asynchronously.
      send: (msg) => void Promise.resolve().then(() => this.receive(conn, msg)),
    });
    session.bot = bot;
    this.connect(conn);
    const client = this.clients.get(conn.id) as Client;
    client.session = session;
    session.client = client;
    bot.playerId = session.playerId;
    return session;
  }

  private onFlip(client: Client, s: Session, msg: ClientMessageOf<"flip">): void {
    if (s.matchId !== msg.matchId) return this.reject(client, "not_a_player", undefined, msg.ref);
    const runtime = this.live.get(msg.matchId);
    if (!runtime) return this.reject(client, "not_active", undefined, msg.ref);
    const code = runtime.flip(s.playerId, msg.card);
    if (code) this.reject(client, code, undefined, msg.ref);
  }

  /** Walk away from a live match: you stop receiving it; if no human is left, it is abandoned. */
  private onLeaveMatch(s: Session, matchId: string): void {
    if (s.watching === matchId) return this.unwatch(s);
    const runtime = s.matchId === matchId ? this.live.get(matchId) : undefined;
    if (!runtime) return;
    s.matchId = null;
    runtime.setConnected(s.playerId, false);
    const humansLeft = runtime.authoritative.players.some((p) => p.kind === "human" && this.sessions.get(p.id)?.matchId === matchId);
    if (!humansLeft) runtime.abandon();
    else this.checkAbandon(runtime);
  }

  private onSpectate(client: Client, s: Session, matchId: string): void {
    const runtime = this.live.get(matchId);
    if (!runtime || runtime.finished) return this.reject(client, "not_found", "That match is not live.");
    if (s.matchId === matchId) return this.sendSnapshot(client, runtime, s.playerId);
    this.unwatch(s);
    runtime.spectators.add(s.playerId);
    s.watching = matchId;
    this.sendSnapshot(client, runtime, null);
  }

  private unwatch(s: Session): void {
    if (s.watching) this.live.get(s.watching)?.spectators.delete(s.playerId);
    s.watching = null;
  }

  private onSync(client: Client, s: Session, matchId: string): void {
    const runtime = this.live.get(matchId);
    if (!runtime) return this.reject(client, "not_found");
    if (s.matchId === matchId) return this.sendSnapshot(client, runtime, s.playerId);
    if (s.watching === matchId) return this.sendSnapshot(client, runtime, null);
    this.reject(client, "not_a_player");
  }

  private sendSnapshot(client: Client, runtime: MatchRuntime, you: string | null): void {
    this.send(client, { type: "match_snapshot", match: runtime.snapshot(), you });
    for (const f of runtime.presenceFrames()) this.sendFrame(client, f);
  }

  private async onGetReplay(client: Client, matchId: string): Promise<void> {
    // The log holds the seed: never hand it out while the match can still be played.
    if (this.live.has(matchId)) return this.reject(client, "match_not_finished");
    const events = await this.store.load(matchId);
    if (events.length === 0) return this.reject(client, "not_found", "No replay with that id.");
    if (events[events.length - 1]?.event.type !== "match_finished") return this.reject(client, "match_not_finished");
    this.send(client, { type: "replay", matchId, events });
  }

  private checkAbandon(runtime: MatchRuntime): void {
    const humans = runtime.authoritative.players.filter((p) => p.kind === "human");
    const anyone = humans.some((p) => runtime.connected.get(p.id));
    const pending = this.abandonTimers.get(runtime.id);
    if (anyone) {
      if (pending !== undefined) this.scheduler.clearTimeout(pending);
      this.abandonTimers.delete(runtime.id);
    } else if (pending === undefined) {
      this.abandonTimers.set(
        runtime.id,
        this.scheduler.setTimeout(() => {
          this.abandonTimers.delete(runtime.id);
          runtime.abandon();
        }, this.config.abandonAfterMs),
      );
    }
  }

  private onFinished(runtime: MatchRuntime, summary: MatchSummary, roomCode: string | null): void {
    this.metrics.matchesFinished.inc({ reason: summary.reason });
    const ratings = this.ladder.apply(summary);
    this.deliver(runtime.audience(), frame({ type: "match_summary", summary, ratings }));
    const timer = this.abandonTimers.get(runtime.id);
    if (timer !== undefined) this.scheduler.clearTimeout(timer);
    this.abandonTimers.delete(runtime.id);
    this.live.delete(runtime.id);
    for (const id of runtime.spectators) {
      const s = this.sessions.get(id);
      if (s?.watching === runtime.id) s.watching = null;
    }
    for (const id of runtime.playerIds) {
      const s = this.sessions.get(id);
      if (!s) continue;
      s.matchId = null;
      if (s.kind === "bot") {
        s.bot?.stop();
        if (s.client) this.clients.delete(s.client.conn.id);
        this.sessions.delete(id);
      } else if (!s.client && !s.roomCode && s.graceTimer === null) {
        this.sessions.delete(id);
      }
    }
    const room = roomCode ? this.rooms.get(roomCode) : undefined;
    if (room) {
      room.status = "lobby";
      room.matchId = null;
      room.lastMatchId = runtime.id;
      this.broadcastRoom(room.code);
    }
    this.logger.info("match finished", { matchId: summary.matchId, reason: summary.reason, winner: summary.standings[0]?.name });
  }

  // ------------------------------------------------------------ io

  private async(client: Client, work: Promise<void>): void {
    work.catch((err: unknown) => {
      this.logger.error("store read failed", { error: String(err) });
      this.reject(client, "internal", "Storage is unavailable.");
    });
  }

  private deliver(playerIds: Iterable<string>, f: Frame): void {
    for (const id of playerIds) {
      const c = this.sessions.get(id)?.client;
      if (c) this.sendFrame(c, f);
    }
  }

  private send(client: Client, message: ServerMessage): void {
    this.sendFrame(client, frame(message));
  }

  private sendFrame(client: Client, f: Frame): void {
    this.metrics.messagesOut.inc();
    client.conn.send(f);
  }

  private reject(client: Client, code: ErrorCode, message?: string, ref?: number): void {
    this.metrics.rejected.inc({ code });
    this.send(client, { type: "error", code, message: message ?? MESSAGES[code] ?? code, ...(ref !== undefined ? { ref } : {}) });
  }

  /** Token bucket per connection; persistent abusers are disconnected. */
  private admit(client: Client): boolean {
    const { capacity, refillPerSec, maxStrikes } = this.config.rateLimit;
    const now = this.scheduler.monotonic();
    client.tokens = Math.min(capacity, client.tokens + ((now - client.refilledAt) / 1000) * refillPerSec);
    client.refilledAt = now;
    if (client.tokens >= 1) {
      client.tokens -= 1;
      return true;
    }
    client.strikes += 1;
    this.reject(client, "rate_limited");
    if (client.strikes >= maxStrikes) client.conn.close(4008, "rate limited");
    return false;
  }
}

function assertNever(x: never): never {
  throw new Error(`unhandled message ${JSON.stringify(x)}`);
}
