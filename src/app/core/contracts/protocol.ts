/**
 * The socket protocol: event names, payloads, envelopes and error codes.
 *
 * Spec: `docs/05-realtime-protocol.md`.
 *
 * Naming: `domain:verb`, lowercase, colon-separated. Client→server events that can fail use
 * acknowledgement callbacks so failures come back typed instead of as a correlated error event.
 * Server→client events are fire-and-forget.
 *
 * The two event maps at the bottom type Socket.IO on both ends:
 *
 * ```ts
 * // server
 * new Server<ClientToServerEvents, ServerToClientEvents>()
 * // client
 * io<ServerToClientEvents, ClientToServerEvents>(url)
 * ```
 */

import type { GameEvent, GameLength, Placement, PlayerInfo, RuleConfig, Seat } from './actions.js';
import type { ClientAction } from './actions.js';
import type { PlayerView, Prompt, SeatConfig, TableState } from './views.js';

/**
 * Bumped on any breaking protocol change. There is no backward-compatibility window in v1:
 * on mismatch the server replies `PROTOCOL_MISMATCH` and the client shows "reload required".
 */
export const PROTOCOL_VERSION = 1;

/** Socket.IO handshake `auth` payload (also accepted as query parameters). */
export interface HandshakeAuth {
  /** Access JWT. Absent only where the deployment allows anonymous connections. */
  token?: string;
  protocolVersion: number;
}

/** Envelope for ordered, game-affecting messages. */
export interface ServerEvent<T> {
  /** Per-table, starts at 1. A gap tells the client to resync. */
  seq: number;
  /** Server epoch ms — for latency display only, never for logic. */
  ts: number;
  payload: T;
}

// ---------------------------------------------------------------------------
// Errors and acknowledgements
// ---------------------------------------------------------------------------

/** Stable codes, safe to branch on client-side. `docs/05-realtime-protocol.md` §9. */
export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'TABLE_NOT_FOUND',
  'NOT_SEATED',
  'STALE_PROMPT',
  'ILLEGAL_ACTION',
  'NOT_YOUR_TURN',
  'TABLE_FULL',
  'ALREADY_IN_GAME',
  'RATE_LIMITED',
  'INTERNAL',
  /** Handshake `protocolVersion` does not match `PROTOCOL_VERSION` (§10). */
  'PROTOCOL_MISMATCH',
  /** Payload failed schema validation at the boundary. */
  'BAD_REQUEST',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ProtocolError {
  code: ErrorCode;
  message: string;
  promptId?: string;
}

/** `{ ok: true } & T` on success. `T` defaults to no extra fields. */
export type Ack<T = Record<never, never>> =
  ({ ok: true } & T) | { ok: false; error: ProtocolError };

export type AckFn<T = Record<never, never>> = (response: Ack<T>) => void;

// ---------------------------------------------------------------------------
// Client → server payloads
// ---------------------------------------------------------------------------

export interface LobbyQuickmatchPayload {
  length: GameLength;
}

export interface LobbyCancelPayload {
  ticketId: string;
}

export interface TableCreatePayload {
  length: GameLength;
  seats: [SeatConfig, SeatConfig, SeatConfig, SeatConfig];
  private: boolean;
}

/** Exactly one of `tableId` / `inviteCode`. */
export interface TableJoinPayload {
  tableId?: string;
  inviteCode?: string;
}

export interface TableIdPayload {
  tableId: string;
}

export interface TableSetSeatPayload {
  tableId: string;
  seat: Seat;
  fill: SeatConfig['fill'];
  botLevel?: SeatConfig['botLevel'];
}

export interface TableReadyPayload {
  tableId: string;
  ready: boolean;
}

export interface GameActionPayload {
  tableId: string;
  /** The prompt this action answers. Mandatory — see §5. */
  promptId: string;
  action: ClientAction;
}

export interface GameResyncPayload {
  tableId: string;
  fromSeq?: number;
}

export interface GameStampPayload {
  tableId: string;
  stampId: StampId;
}

/** Fixed emote set. [PROVISIONAL] — the final set is a product decision in M4. */
export const STAMP_IDS = [
  'greeting',
  'thanks',
  'sorry',
  'good-luck',
  'well-played',
  'oops',
] as const;

export type StampId = (typeof STAMP_IDS)[number];

// ---------------------------------------------------------------------------
// Server → client payloads
// ---------------------------------------------------------------------------

/**
 * Sent immediately after a successful handshake. [M0 addition] — the docs describe the
 * handshake but name no acknowledgement event; the client needs one to show "connected".
 */
export interface SessionHelloPayload {
  protocolVersion: number;
  /** Server epoch ms, for clock-skew estimation. */
  serverTime: number;
  /** `null` until authentication lands in M3. */
  userId: string | null;
}

/** An older tab was demoted to read-only; only the newest socket may act. */
export interface SessionDemotedPayload {
  reason: 'newer-connection';
}

export interface UserActiveTablePayload {
  tableId: string | null;
}

export interface LobbyMatchedPayload {
  tableId: string;
}

export interface LobbyQueueStatusPayload {
  position: number;
  waiting: number;
  etaSeconds: number;
}

export interface LobbyCancelledPayload {
  ticketId: string;
  reason: 'user' | 'server-restart' | 'timeout';
}

export interface TablePlayerPayload {
  seat: Seat;
  player: PlayerInfo;
}

export interface TableCountdownPayload {
  secondsRemaining: number;
}

export interface GameStartedPayload {
  tableId: string;
  players: [PlayerInfo, PlayerInfo, PlayerInfo, PlayerInfo];
  config: RuleConfig;
  /** sha256 of the seed; the seed itself arrives with `game:ended`. */
  seedHash: string;
}

export type PromptCancelReason = 'resolved' | 'superseded' | 'timeout' | 'hand-ended';

export interface GamePromptCancelledPayload {
  promptId: string;
  reason: PromptCancelReason;
}

export interface GameSnapshotPayload {
  seq: number;
  view: PlayerView;
}

export interface RatingChange {
  seat: Seat;
  before: number;
  after: number;
}

export interface GameEndedPayload {
  tableId: string;
  placements: Placement[];
  /** Released here so the walls can be re-derived and checked against `seedHash`. */
  seed: string;
  seedHash: string;
  ratingChanges?: RatingChange[];
}

export interface GameStampBroadcastPayload {
  seat: Seat;
  stampId: StampId;
}

export interface PlayerConnectionPayload {
  seat: Seat;
  graceSecondsRemaining?: number;
}

export interface PlayerAfkPayload {
  seat: Seat;
  takenOverByBot: boolean;
}

// ---------------------------------------------------------------------------
// Event maps
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  'lobby:quickmatch': (payload: LobbyQuickmatchPayload, ack: AckFn<{ ticketId: string }>) => void;
  'lobby:cancel': (payload: LobbyCancelPayload, ack: AckFn) => void;

  'table:create': (
    payload: TableCreatePayload,
    ack: AckFn<{ tableId: string; inviteCode?: string }>,
  ) => void;
  'table:join': (payload: TableJoinPayload, ack: AckFn<{ tableId: string }>) => void;
  'table:leave': (payload: TableIdPayload, ack: AckFn) => void;
  'table:setSeat': (payload: TableSetSeatPayload, ack: AckFn) => void;
  'table:ready': (payload: TableReadyPayload, ack: AckFn) => void;
  'table:start': (payload: TableIdPayload, ack: AckFn) => void;
  'spectate:join': (payload: TableIdPayload, ack: AckFn) => void;

  'game:action': (payload: GameActionPayload, ack: AckFn) => void;
  'game:resync': (payload: GameResyncPayload, ack: AckFn) => void;
  'game:stamp': (payload: GameStampPayload, ack: AckFn) => void;
}

export interface ServerToClientEvents {
  'session:hello': (payload: SessionHelloPayload) => void;
  'session:demoted': (payload: SessionDemotedPayload) => void;
  'user:activeTable': (payload: UserActiveTablePayload) => void;

  'lobby:matched': (payload: LobbyMatchedPayload) => void;
  'lobby:queueStatus': (payload: LobbyQueueStatusPayload) => void;
  'lobby:cancelled': (payload: LobbyCancelledPayload) => void;

  'table:state': (payload: TableState) => void;
  'table:playerJoined': (payload: TablePlayerPayload) => void;
  'table:playerLeft': (payload: TablePlayerPayload) => void;
  'table:countdown': (payload: TableCountdownPayload) => void;

  'game:started': (payload: GameStartedPayload) => void;
  'game:event': (payload: ServerEvent<GameEvent>) => void;
  'game:prompt': (payload: Prompt) => void;
  'game:promptCancelled': (payload: GamePromptCancelledPayload) => void;
  'game:snapshot': (payload: GameSnapshotPayload) => void;
  'game:ended': (payload: GameEndedPayload) => void;
  'game:stamp': (payload: GameStampBroadcastPayload) => void;

  'player:disconnected': (payload: PlayerConnectionPayload) => void;
  'player:reconnected': (payload: PlayerConnectionPayload) => void;
  'player:afk': (payload: PlayerAfkPayload) => void;

  error: (payload: ProtocolError) => void;
}

export type ClientToServerEventName = keyof ClientToServerEvents;
export type ServerToClientEventName = keyof ServerToClientEvents;

/** Rate limits, `docs/05-realtime-protocol.md` §8. Enforced in M3. */
export const RATE_LIMITS = {
  gameAction: { perSecond: 20, burst: 40 },
  gameStamp: { perSeconds: 3, count: 1, perHand: 10 },
  gameResync: { perSeconds: 2, count: 1 },
  illegalActionsPerGame: 10,
  connectionsPerMinutePerIp: 30,
} as const;
