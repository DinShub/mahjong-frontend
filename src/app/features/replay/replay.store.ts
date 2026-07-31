import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { GameEvent, Seat } from '@contracts/actions';
import { project } from '@contracts/project';
import type { Viewer } from '@contracts/project';
import { replayLogSchema } from '@contracts/schemas';
import { STATS_ROUTES } from '@contracts/stats';
import type { ReplayLog } from '@contracts/stats';
import type { PlayerView } from '@contracts/views';

import { APP_CONFIG } from '@core/config/app-config';
import { SCHEDULER } from '@core/time/scheduler';
import type { TimerHandle } from '@core/time/scheduler';

import { applyEvent, viewFromGameStart } from '@features/game/state/apply-event';

/**
 * Who the board is drawn for. A `Seat` redacts to what that seat saw at the time; `'all'` shows
 * everything, which is the mode a finished game makes possible and a live one never could.
 */
export type ReplayViewer = Seat | 'all';

/** `docs/07-frontend.md` §5 — *"play/pause, step, seek by hand, speed"*. */
export const SPEEDS = [0.5, 1, 2, 4] as const;
export type ReplaySpeed = (typeof SPEEDS)[number];

/** How long one event dwells at 1× before the next is applied. */
const STEP_MS = 700;

/**
 * The replay's state.
 *
 * **It is the same fold as the live game.** `applyEvent` and `viewFromGameStart` are imported from
 * `features/game/state/`, not reimplemented: `docs/07-frontend.md` §5 says a replay *"consumes the
 * same `GameEvent[]` the live game does — it is the same render layer, fed from a fetched log
 * instead of a socket"*, and a second fold would be a second thing to hold to the engine's own
 * state through the fixtures `apply-event.spec.ts` checks it against.
 *
 * What is different is where redaction happens. Live, the server projects and the client is simply
 * never told; here the client holds the whole log and projects it itself, with `project()` — the
 * server's function, synced through `contracts/`. That is what makes seat switching instant: the
 * viewer changes, the fold re-runs, nothing is refetched.
 *
 * The fold is from the beginning every time the cursor or the viewer moves. A hanchan is on the
 * order of a thousand events and the fold is a few object spreads apiece, so this is well under a
 * frame — and it is the only way `seek(0)` and *"switch to seat 2 at event 400"* can be the same
 * code path as stepping forward one.
 */
@Injectable()
export class ReplayStore {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly scheduler = inject(SCHEDULER);

  private readonly _log = signal<ReplayLog | null>(null);
  private readonly _cursor = signal(0);
  private readonly _viewer = signal<ReplayViewer>(0);
  /** The seat the board faces. Follows {@link _viewer} except while it is `all`. */
  private readonly _orientation = signal<Seat>(0);
  private readonly _playing = signal(false);
  private readonly _speed = signal<ReplaySpeed>(1);
  private readonly _error = signal<string | null>(null);
  private readonly _loading = signal(false);

  private timer: TimerHandle | null = null;

  readonly log = this._log.asReadonly();
  readonly cursor = this._cursor.asReadonly();
  readonly viewer = this._viewer.asReadonly();
  readonly playing = this._playing.asReadonly();
  readonly speed = this._speed.asReadonly();
  readonly error = this._error.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly revealAll = computed(() => this._viewer() === 'all');

  /** One past the last event. `cursor === total` is "the game is over", not an overflow. */
  readonly total = computed(() => this._log()?.events.length ?? 0);

  readonly atEnd = computed(() => this._cursor() >= this.total());

  /**
   * The board, folded up to the cursor.
   *
   * `game-start` is `events[0]` and seeds the view; everything after it is applied in order. An
   * event the fold cannot make sense of is skipped rather than thrown on — a replay that renders
   * 99 % of a game beats an error page, and the log is not a live game whose state has to stay
   * exact for the next action to be legal.
   */
  readonly view = computed<PlayerView | null>(() => {
    const log = this._log();
    if (log === null) return null;

    // The board is always drawn from *somebody's* side of the table — that is what decides which
    // seat is at the bottom. In all-revealed mode that seat is whichever one was being watched
    // when the mode was turned on, so revealing the other hands does not also spin the board.
    const mySeat = this._orientation();
    const redact = this._viewer() !== 'all';
    const viewer: Viewer = redact ? mySeat : null;

    const start = log.events[0];
    if (start === undefined || start.t !== 'game-start') return null;

    let view = viewFromGameStart(start, { tableId: log.gameId, mySeat });
    const limit = Math.min(this._cursor(), log.events.length - 1);
    for (let index = 1; index <= limit; index++) {
      const event = log.events[index]!;
      const folded = applyEvent(view, redact ? project(event, viewer) : event, {
        tableId: log.gameId,
        mySeat,
      });
      if (folded === null) break;
      view = folded;
    }
    return view;
  });

  /** The hand the cursor is inside, for the transport bar's label and its seek buttons. */
  readonly currentHand = computed(() => {
    const log = this._log();
    if (log === null) return null;
    const cursor = this._cursor();
    return (
      [...log.hands].reverse().find((hand) => cursor >= hand.startEvent) ?? log.hands[0] ?? null
    );
  });

  /**
   * The most recent `agari` or `ryuukyoku` at or before the cursor, if the cursor has not yet
   * passed the hand's end. What the result overlay shows, without a subscription to anything.
   */
  readonly handResult = computed<GameEvent | null>(() => {
    const log = this._log();
    if (log === null) return null;
    const hand = this.currentHand();
    if (hand === null) return null;
    for (let index = Math.min(this._cursor(), hand.endEvent - 1); index >= hand.startEvent; index--) {
      const event = log.events[index];
      if (event?.t === 'agari' || event?.t === 'ryuukyoku') return event;
    }
    return null;
  });

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  async load(gameId: string): Promise<void> {
    this.pause();
    this._loading.set(true);
    this._error.set(null);
    this._log.set(null);
    this._cursor.set(0);
    try {
      const raw = await firstValueFrom(
        this.http.get<unknown>(`${this.config.apiUrl}${STATS_ROUTES.replay(gameId)}`),
      );
      // Validated with the server's own schema rather than trusted: a replay that has drifted is
      // better as one error than as a board that folds two thirds of a game and stops.
      this._log.set(replayLogSchema.parse(raw) as ReplayLog);
      // A replay opens on the first human seat, because that is whose game it usually is.
      const parsed = this._log();
      const human = parsed?.players.findIndex((player) => !player.isBot) ?? -1;
      this.setViewer(human < 0 ? 0 : (human as Seat));
    } catch (error) {
      this._error.set(describeError(error));
    } finally {
      this._loading.set(false);
    }
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  setViewer(viewer: ReplayViewer): void {
    this._viewer.set(viewer);
    if (viewer !== 'all') this._orientation.set(viewer);
  }

  setSpeed(speed: ReplaySpeed): void {
    this._speed.set(speed);
    if (this._playing()) this.schedule();
  }

  seek(cursor: number): void {
    this._cursor.set(Math.max(0, Math.min(cursor, this.total())));
    if (this.atEnd()) this.pause();
  }

  step(delta = 1): void {
    this.pause();
    this.seek(this._cursor() + delta);
  }

  /** To the start of the hand the cursor is in, or the previous one if it is already there. */
  seekHand(delta: -1 | 1): void {
    const log = this._log();
    if (log === null || log.hands.length === 0) return;
    const cursor = this._cursor();
    const current = log.hands.findIndex(
      (hand) => cursor >= hand.startEvent && cursor < hand.endEvent,
    );
    const index = current < 0 ? (delta === 1 ? 0 : log.hands.length - 1) : current;
    // Rewinding from mid-hand goes to the top of *this* hand first — the behaviour a transport bar
    // in any video player has, and the one a player expects when they missed the deal.
    const target =
      delta === -1 && cursor > (log.hands[index]?.startEvent ?? 0) ? index : index + delta;
    const hand = log.hands[Math.max(0, Math.min(target, log.hands.length - 1))];
    if (hand !== undefined) this.seek(hand.startEvent);
  }

  play(): void {
    if (this.atEnd()) this.seek(0);
    this._playing.set(true);
    this.schedule();
  }

  pause(): void {
    this._playing.set(false);
    if (this.timer !== null) this.scheduler.cancel(this.timer);
    this.timer = null;
  }

  toggle(): void {
    if (this._playing()) this.pause();
    else this.play();
  }

  private schedule(): void {
    if (this.timer !== null) this.scheduler.cancel(this.timer);
    this.timer = this.scheduler.schedule(() => {
      this.timer = null;
      if (!this._playing()) return;
      if (this.atEnd()) {
        this.pause();
        return;
      }
      this._cursor.update((cursor) => cursor + 1);
      if (this.atEnd()) this.pause();
      else this.schedule();
    }, STEP_MS / this._speed());
  }

  destroy(): void {
    this.pause();
  }
}

function describeError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return error instanceof Error ? error.message : 'the replay could not be loaded';
  }
  const body = error.error as { code?: string } | null;
  switch (body?.code) {
    case 'GAME_NOT_FINISHED':
      return 'This game is still being played. Replays are available once a game ends.';
    case 'NOT_FOUND':
      return 'No such game.';
    default:
      return error.status === 0 ? 'The server is unreachable.' : 'The replay could not be loaded.';
  }
}
