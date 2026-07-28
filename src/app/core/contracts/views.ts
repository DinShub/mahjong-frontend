/**
 * Projected state — what a single seat is allowed to see.
 *
 * Spec: `docs/05-realtime-protocol.md` §§5, 7 and `docs/03-domain-model.md` §4.
 *
 * `PlayerView` is the contract that enforces hidden information: if a field is not here, it
 * cannot reach a client. Note what is deliberately absent — the wall, ura indicators, the seed,
 * and any other seat's concealed tiles. A property test asserts that no serialization of a
 * `PlayerView` for seat *n* contains another seat's tiles.
 */

import type {
  Action,
  BotLevel,
  PlayerInfo,
  RuleConfig,
  Seat,
  Wind,
  DiscardWire,
  MeldWire,
  GameLength,
} from './actions.js';
import type { TileStr } from './tiles.js';

/** `docs/03-domain-model.md` §4. */
export type GamePhase =
  | 'waiting'
  | 'hand-start'
  | 'awaiting-draw'
  | 'awaiting-discard'
  | 'awaiting-calls'
  | 'awaiting-chankan'
  | 'hand-end'
  | 'game-end';

export type ConnectionState = 'online' | 'disconnected' | 'bot';

export type SeatFill = 'open' | 'bot' | 'locked';

export interface SeatConfig {
  fill: SeatFill;
  botLevel?: BotLevel;
}

/**
 * "It is your turn to make a decision, here is exactly what you may do."
 *
 * The client renders buttons from `options` and nothing else — it never computes legality.
 * `promptId` is the anti-desync mechanism: an action carrying a stale or unknown id is
 * rejected with `STALE_PROMPT`, which makes double-clicks and late clicks harmless.
 */
export interface Prompt {
  promptId: string;
  seat: Seat;
  /** The complete legal set. */
  options: Action[];
  /** Server epoch ms. */
  deadline: number;
  /** This player's remaining reserve seconds. */
  bankRemaining: number;
}

export interface PlayerViewSeat {
  seat: Seat;
  player: PlayerInfo;
  /** Tile count only — the honest view of an opponent's hand. */
  handSize: number;
  /** Populated only for `mySeat`. */
  hand: TileStr[] | null;
  /** The just-drawn tile, kept separate for tsumogiri rendering. Only for `mySeat`. */
  drawn: TileStr | null;
  melds: MeldWire[];
  discards: DiscardWire[];
  riichi: { declaredOnTurn: number; ippatsu: boolean } | null;
  /** Only true after an exhaustive draw. */
  isTenpaiRevealed: boolean;
  connection: ConnectionState;
  /** Remaining reserve seconds. */
  clockBank: number;
}

export interface PlayerView {
  seq: number;
  tableId: string;
  config: RuleConfig;
  round: Wind;
  kyoku: number;
  honba: number;
  riichiSticks: number;
  dealer: Seat;
  /** `null` = spectator. */
  mySeat: Seat | null;
  scores: number[];
  wallRemaining: number;
  /** Revealed indicators only. */
  doraIndicators: TileStr[];
  players: PlayerViewSeat[];
  phase: GamePhase;
  turn: Seat;
  pendingPrompt: Prompt | null;
  lastEventSeq: number;
}

// ---------------------------------------------------------------------------
// Pre-game table
// ---------------------------------------------------------------------------

export type TableStatus = 'waiting' | 'starting' | 'in_progress' | 'finished';

export interface TableSeatState {
  seat: Seat;
  config: SeatConfig;
  /** `null` while the seat is empty. */
  player: PlayerInfo | null;
  ready: boolean;
  connection: ConnectionState;
}

export interface TableState {
  tableId: string;
  status: TableStatus;
  /** `null` for a matchmade table with no host. */
  hostUserId: string | null;
  config: RuleConfig;
  length: GameLength;
  isPrivate: boolean;
  /** Only sent to participants of a private table. */
  inviteCode: string | null;
  seats: TableSeatState[];
  /** Present once a game has started. */
  gameId: string | null;
}
