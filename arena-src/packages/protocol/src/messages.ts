import type {
  BotLevel,
  MatchMode,
  MatchState,
  MatchStatus,
  PlayerKind,
  PublicMatchEvent,
  RejectCode,
  StoredEvent,
  MatchSummary,
} from "@arena/engine";
import { finite, int, literal, nullable, object, oneOf, optional, string, tagged, type Infer, type Result } from "./schema";

/** Bumped on any breaking change; `hello` with another version is refused. */
export const PROTOCOL_VERSION = 1;

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
const ID = /^[a-z]_[a-z0-9]{6,32}$/;
const BOT_LEVELS = ["rookie", "adept", "ace"] as const satisfies readonly BotLevel[];

const matchId = string({ min: 3, max: 40, pattern: ID });
const card = int(0, 99);

// ---------------------------------------------------------------- client -> server

export const clientMessageSchema = tagged({
  hello: object({
    type: literal("hello"),
    protocol: int(1, 1000),
    name: string({ min: 1, max: 40 }),
    token: optional(string({ max: 200 })),
  }),
  set_name: object({ type: literal("set_name"), name: string({ min: 1, max: 40 }) }),
  create_room: object({
    type: literal("create_room"),
    cardCount: int(6, 36),
    maxPlayers: int(1, 4),
    bots: int(0, 3),
    botLevel: oneOf(BOT_LEVELS),
    /** Client-proposed code, so a load balancer can route by it before the room exists. */
    code: optional(string({ min: 5, max: 5, pattern: ROOM_CODE })),
  }),
  update_room: object({
    type: literal("update_room"),
    cardCount: optional(int(6, 36)),
    maxPlayers: optional(int(1, 4)),
    bots: optional(int(0, 3)),
    botLevel: optional(oneOf(BOT_LEVELS)),
  }),
  join_room: object({ type: literal("join_room"), code: string({ min: 5, max: 5, pattern: ROOM_CODE }) }),
  leave_room: object({ type: literal("leave_room") }),
  start_match: object({ type: literal("start_match") }),
  queue_join: object({ type: literal("queue_join"), botLevel: optional(oneOf(BOT_LEVELS)) }),
  queue_leave: object({ type: literal("queue_leave") }),
  flip: object({ type: literal("flip"), matchId, card, ref: optional(int(0, 2 ** 31)) }),
  focus: object({ type: literal("focus"), matchId, card: nullable(card) }),
  leave_match: object({ type: literal("leave_match"), matchId }),
  spectate: object({ type: literal("spectate"), matchId }),
  unwatch: object({ type: literal("unwatch") }),
  sync: object({ type: literal("sync"), matchId }),
  list_live: object({ type: literal("list_live") }),
  list_replays: object({ type: literal("list_replays"), limit: optional(int(1, 50)) }),
  get_replay: object({ type: literal("get_replay"), matchId }),
  get_ladder: object({ type: literal("get_ladder"), limit: optional(int(1, 100)) }),
  ping: object({ type: literal("ping"), t: finite() }),
});

export type ClientMessage = Infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage["type"];
export type ClientMessageOf<T extends ClientMessageType> = Extract<ClientMessage, { type: T }>;

export function parseClientMessage(input: unknown): Result<ClientMessage> {
  return clientMessageSchema.parse(input);
}

// ---------------------------------------------------------------- views

export interface RoomSettings {
  readonly cardCount: number;
  readonly maxPlayers: number;
  readonly bots: number;
  readonly botLevel: BotLevel;
}

export interface RoomMember {
  readonly id: string;
  readonly name: string;
  readonly kind: PlayerKind;
  readonly botLevel: BotLevel | null;
  readonly connected: boolean;
  readonly rating: number | null;
}

export interface RoomView {
  readonly code: string;
  readonly quick: boolean;
  readonly hostId: string;
  readonly status: "lobby" | "playing";
  readonly settings: RoomSettings;
  readonly members: readonly RoomMember[];
  readonly matchId: string | null;
  readonly lastMatchId: string | null;
}

export interface LiveMatchInfo {
  readonly matchId: string;
  readonly mode: MatchMode;
  readonly status: MatchStatus;
  readonly cardCount: number;
  readonly triplesLeft: number;
  readonly endsAt: number | null;
  readonly spectators: number;
  readonly players: readonly { readonly name: string; readonly kind: PlayerKind; readonly seat: number; readonly score: number; readonly triples: number }[];
}

export interface LadderEntry {
  readonly playerId: string;
  readonly name: string;
  readonly rating: number;
  readonly games: number;
  readonly wins: number;
  readonly lastPlayedAt: number;
}

export interface RatingChange {
  readonly playerId: string;
  readonly before: number;
  readonly after: number;
}

export interface ServerInfo {
  readonly kind: "node" | "worker";
  readonly version: string;
  readonly store: string;
  readonly instance: string;
}

export type ErrorCode =
  | RejectCode
  | "bad_message"
  | "hello_required"
  | "protocol_mismatch"
  | "rate_limited"
  | "not_found"
  | "room_full"
  | "not_host"
  | "not_in_room"
  | "busy"
  | "invalid_settings"
  | "code_taken"
  | "match_not_finished"
  | "internal";

// ---------------------------------------------------------------- server -> client

export type ServerMessage =
  | { readonly type: "welcome"; readonly playerId: string; readonly name: string; readonly token: string; readonly serverTime: number; readonly server: ServerInfo; readonly rating: number }
  | { readonly type: "error"; readonly code: ErrorCode; readonly message: string; readonly ref?: number }
  | { readonly type: "room"; readonly room: RoomView | null }
  | { readonly type: "queue"; readonly searching: boolean; readonly waiting: number; readonly since: number | null }
  /** Full public state: on match start, reconnect, spectate or sync. `you` is null for spectators. */
  | { readonly type: "match_snapshot"; readonly match: MatchState; readonly you: string | null }
  | { readonly type: "match_event"; readonly matchId: string; readonly seq: number; readonly event: PublicMatchEvent }
  /** Ephemeral, never logged: where a player's attention is, and whether they are connected. */
  | { readonly type: "presence"; readonly matchId: string; readonly playerId: string; readonly focus: number | null; readonly connected: boolean }
  | { readonly type: "match_summary"; readonly summary: MatchSummary; readonly ratings: readonly RatingChange[] }
  | { readonly type: "live_list"; readonly matches: readonly LiveMatchInfo[] }
  | { readonly type: "replay_list"; readonly replays: readonly MatchSummary[] }
  | { readonly type: "replay"; readonly matchId: string; readonly events: readonly StoredEvent[] }
  | { readonly type: "ladder"; readonly entries: readonly LadderEntry[] }
  | { readonly type: "pong"; readonly t: number; readonly serverTime: number };

export type ServerMessageType = ServerMessage["type"];
export type ServerMessageOf<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>;

/** Display names: trimmed, control characters stripped, whitespace collapsed, at most 18 characters. */
export function sanitizeName(raw: string): string {
  const cleaned = Array.from(raw.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim()).slice(0, 18).join("");
  return cleaned.length > 0 ? cleaned : "Player";
}
