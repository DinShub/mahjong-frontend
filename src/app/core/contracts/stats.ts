/**
 * The HTTP contract for everything M5 puts *around* the game: stats, history, replay.
 *
 * Spec: `docs/09-database.md` → `playerStats`, *"Stats pipeline"*; `docs/07-frontend.md` §5
 * (*"Replays"*); `tasks/backlog.md` M5.
 *
 * Here for the same reason `auth.ts` is: `docs/02-architecture.md` makes this folder the source of
 * truth for the FE/BE contract, and a response shape the frontend re-declares by hand is a shape
 * that drifts. Nothing here is a new *concept* — `PlayerStatsView` is the stored `playerStats`
 * document minus the fields a client has no use for, and `ReplayLog` is the persisted event log
 * plus the header the viewer needs to seed a `PlayerView` from.
 *
 * **What is deliberately absent.** `ratings` — `docs/09` says v1 *"computes and stores a rating
 * after every game but does not surface it"*, so there is no rating field on any response here.
 * Adding one is a product decision, and the wire is where that decision would leak out first.
 */

import type { GameLength, Placement, RuleConfig, Seat, Wind, YakuId } from './actions.js';
import type { GameEvent } from './actions.js';
import type { PlayerInfo } from './actions.js';

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * A player's lifetime numbers — one document, one read.
 *
 * `docs/09-database.md`: *"Denormalized on purpose — profile pages must be one read."* The derived
 * rates are stored rather than computed here for the same reason they are stored in Mongo: two
 * places that compute a rate are two places that can disagree about the denominator.
 */
export interface PlayerStatsView {
  userId: string;
  games: number;
  hanchan: number;
  tonpuusen: number;
  /** Counts of 1st…4th. */
  placements: [number, number, number, number];
  avgPlacement: number;
  /** Sum of per-game net scores, after uma and oka, in units of 1000. */
  totalNetScore: number;
  busts: number;
  hands: number;
  wins: number;
  winRate: number;
  dealIns: number;
  dealInRate: number;
  tsumoWins: number;
  riichiDeclared: number;
  riichiRate: number;
  riichiWinRate: number;
  callRate: number;
  tenpaiAtDraw: number;
  drawsPlayed: number;
  avgWinPoints: number;
  avgDealInPoints: number;
  avgWinTurn: number;
  /** Keyed by `YakuId`, plus yakuman ids. Sparse: a yaku never won does not appear. */
  yakuCounts: Record<string, number>;
  yakumanCount: number;
  updatedAt: string;
}

/**
 * `GET /users/:id/profile` — *"public profile + aggregate stats"* (`docs/06-backend.md` §2).
 *
 * Identity and numbers in one response because the profile page renders both and
 * `docs/09-database.md` is explicit that it must be one read. Nothing here is private: no email, no
 * rating, no last-seen.
 */
export interface UserProfile {
  userId: string;
  displayName: string;
  avatarId: string;
  isGuest: boolean;
  createdAt: string;
  stats: PlayerStatsView;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface GameSummaryPlayer {
  seat: Seat;
  /** `null` for a bot. */
  userId: string | null;
  displayName: string;
  avatarId: string;
  isBot: boolean;
  botLevel: string | null;
  finalScore: number | null;
  placement: 1 | 2 | 3 | 4 | null;
  /** After uma + oka, in units of 1000. */
  netScore: number | null;
}

/**
 * One row of the history list.
 *
 * `seed` is present only on a finished game — the commit-reveal of
 * `docs/11-nonfunctional.md` §1 is what makes the client's verification button possible, and
 * publishing it a moment early would hand a live table its own wall.
 */
export interface GameSummary {
  gameId: string;
  status: 'in_progress' | 'finished' | 'abandoned';
  length: GameLength;
  isPrivate: boolean;
  hands: number;
  players: GameSummaryPlayer[];
  /** The seat held by the user whose history this row belongs to. */
  seat: Seat | null;
  seedHash: string;
  seed: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
}

export interface GameHistoryPage {
  games: GameSummary[];
  /** Pass back as `?cursor=` for the next page. `null` when this was the last one. */
  nextCursor: string | null;
  /** Total games for the user — the list header, not the pagination mechanism. */
  total: number;
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

/** One finished hand, as the transport bar's seek index sees it. */
export interface ReplayHandIndex {
  index: number;
  round: Wind;
  kyoku: number;
  honba: number;
  dealer: Seat;
  result: 'ron' | 'tsumo' | 'ryuukyoku';
  /** Index into `ReplayLog.events` of this hand's `hand-start`. */
  startEvent: number;
  /** One past this hand's last event. */
  endEvent: number;
  scoreDeltas: number[];
  scoresAfter: number[];
  winners: { seat: Seat; han: number; fu: number; points: number; yaku: YakuId[] }[];
}

/**
 * Everything the replay viewer needs, in one response.
 *
 * **The events are unredacted.** That is safe only because the endpoint refuses any game whose
 * `status !== 'finished'` — the rule `docs/09-database.md` states in bold and the reason
 * `gameEvents` is called *"secret in the same way a password hash is"*. Once a game is over there
 * is nothing left to hide: every hand was revealed at agari or at the exhaustive draw, and the seed
 * is published anyway. Serving the log whole is what lets the viewer switch seats without a
 * refetch — the client redacts locally with `project()`, the server's own function, synced.
 */
export interface ReplayLog {
  gameId: string;
  config: RuleConfig;
  length: GameLength;
  players: PlayerInfo[];
  /** Index === seat. `null` for a bot. */
  userIds: (string | null)[];
  /** Published now the game is finished; `seedHash` was published at its start. */
  seed: string;
  seedHash: string;
  placements: Placement[];
  hands: ReplayHandIndex[];
  events: GameEvent[];
  startedAt: string;
  endedAt: string;
}

/** The body of a failed stats/history/replay request. `code` is stable and safe to branch on. */
export interface StatsErrorResponse {
  code: StatsErrorCode;
  message: string;
}

export const STATS_ERROR_CODES = [
  'NOT_FOUND',
  /** The game exists but is not finished. `docs/09-database.md` → the replay endpoint's hard rule. */
  'GAME_NOT_FINISHED',
  'BAD_REQUEST',
] as const;

export type StatsErrorCode = (typeof STATS_ERROR_CODES)[number];

/**
 * Route paths, so the client never spells one out.
 *
 * `:id` accepts the literal `me` wherever a user id is expected, which is why there is no separate
 * `/stats/me`-shaped route per resource. `/stats/me` itself is kept because `docs/06-backend.md`
 * §2 names it.
 */
export const STATS_ROUTES = {
  /** The caller's own profile. Requires a bearer token; everything else here is a public read. */
  me: '/stats/me',
  profile: (userId: string): string => `/users/${userId}/profile`,
  games: (userId: string): string => `/users/${userId}/games`,
  replay: (gameId: string): string => `/replays/${gameId}`,
  replayDownload: (gameId: string): string => `/replays/${gameId}/download`,
} as const;

/** What `:id` may be instead of an ObjectId, meaning "whoever the bearer token says I am". */
export const ME = 'me';

/** `docs/09-database.md` gives the history index as the hottest query; the page size bounds it. */
export const GAME_HISTORY_PAGE_SIZE = 20;
export const GAME_HISTORY_MAX_PAGE_SIZE = 50;
