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

/**
 * What the viewer's own hand is waiting on.
 *
 * **[M5 addition]** — `docs/07-frontend.md` §1 puts every rules judgement on the server: *"It does
 * not compute what's legal, what a hand is worth, or whether a wait exists. Every one of those
 * comes from the server."* The one exception it allows is a WASM copy of the engine in practice
 * mode, which does not exist, so a client that worked its own waits out would be the second engine
 * this project has refused to build three times.
 *
 * It discloses nothing. A seat's waits follow from its own concealed hand and its own discards,
 * both of which the viewer already holds; `null` for a spectator, who holds neither.
 */
export interface WaitView {
  /** Tiles that complete the hand, ascending. Empty when the hand is not tenpai. */
  tiles: TileStr[];
  /**
   * The subset of `tiles` the viewer has already discarded — the reason they are furiten, and the
   * tiles a UI greys out.
   */
  inMyDiscards: TileStr[];
  /**
   * Ron is blocked on **every** wait, not only the discarded ones: furiten is a property of the
   * hand. Tsumo is unaffected. True for temporary and riichi furiten too, which is why this is not
   * simply `inMyDiscards.length > 0`.
   */
  furiten: boolean;
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
  /** The viewer's own waits. `null` for a spectator. See {@link WaitView}. */
  myWaits: WaitView | null;
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
