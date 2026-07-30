import { signal } from '@angular/core';

import type { GameEvent, GameEventType } from '@contracts/actions';

import type { Scheduler, TimerHandle } from '@core/time/scheduler';

/**
 * The pacing layer between the socket and the board.
 *
 * A call resolution emits four events in one tick; played at socket speed the board would flicker
 * through three states nobody can read. Each event type declares a minimum dwell — the pause
 * *after* it is applied, before the next one is (`docs/07-frontend.md` §1).
 *
 * The event is applied first and the pause comes after, deliberately: state is never behind what
 * the player has been told. An `agari` overlay reads the result out of state, so a "hold" is not
 * "wait to show it", it is "having shown it, do not move on".
 */

/** Dwell after the event is applied, in ms. `docs/07-frontend.md` §1 and `docs/08` §4. */
export const HOLD_MS = 8_000;

export const DWELL_MS: Readonly<Record<GameEventType, number>> = {
  'game-start': 0,
  // The hand-transition screen; the board is being rebuilt underneath it.
  'hand-start': 400,
  draw: 0,
  discard: 120,
  call: 400,
  'riichi-accepted': 600,
  'dora-revealed': 500,
  agari: HOLD_MS,
  ryuukyoku: HOLD_MS,
  'hand-end': 0,
  'game-end': HOLD_MS,
};

/** Events the player can dismiss early — the ones showing a result they have to read. */
export const DISMISSIBLE: ReadonlySet<GameEventType> = new Set<GameEventType>([
  'agari',
  'ryuukyoku',
  'game-end',
]);

/** Backlog above which dwell collapses to zero: a backgrounded tab, or a resync landing. */
export const CATCH_UP_THRESHOLD = 6;

export interface QueuedEvent {
  event: GameEvent;
  seq: number;
}

export interface EventQueueOptions {
  /** Commit the event to the store. Called exactly once per event, in order. */
  apply: (event: GameEvent, seq: number) => void;
  scheduler: Scheduler;
  /** Animation dwells collapse under `prefers-reduced-motion`; holds do not — they are reading time. */
  reducedMotion?: () => boolean;
  catchUpThreshold?: number;
}

export class EventQueue {
  private readonly queue: QueuedEvent[] = [];
  private timer: TimerHandle | null = null;
  private catchingUp = false;
  /** While catching up, whether a dismissible result still stops the drain. */
  private catchUpKeepsHolds = false;
  private readonly options: Required<EventQueueOptions>;

  private readonly _pending = signal(0);
  private readonly _holding = signal(false);

  /** Events waiting behind the current dwell. */
  readonly pending = this._pending.asReadonly();
  /** True while a dismissible result is on screen and the queue is paused behind it. */
  readonly holding = this._holding.asReadonly();

  constructor(options: EventQueueOptions) {
    this.options = {
      reducedMotion: () => false,
      catchUpThreshold: CATCH_UP_THRESHOLD,
      ...options,
    };
  }

  push(event: GameEvent, seq: number): void {
    this.queue.push({ event, seq });
    this._pending.set(this.queue.length);
    // A backlog this deep is a backgrounded tab or a resync landing: catch up through everything,
    // results included. The hands it skips are ones nobody was watching.
    if (this.queue.length > this.options.catchUpThreshold) this.startCatchUp(false);
    this.drain();
  }

  /**
   * Snapshot preemption: a `game:snapshot` replaces state wholesale, so everything queued behind
   * it describes a world that no longer exists. Never merge (`docs/05-realtime-protocol.md` §6).
   */
  clear(): void {
    this.queue.length = 0;
    this.cancelTimer();
    this.catchingUp = false;
    this.catchUpKeepsHolds = false;
    this._pending.set(0);
    this._holding.set(false);
  }

  /** The player closed the overlay: stop holding and carry on. */
  dismiss(): void {
    if (!this._holding()) return;
    this.cancelTimer();
    this._holding.set(false);
    this.drain();
  }

  /** Drain everything now, dwells ignored — used by the "skip" affordance and on teardown. */
  flush(): void {
    this.startCatchUp(false);
    this.cancelTimer();
    this._holding.set(false);
    this.drain();
  }

  /**
   * Catch up because the player is being asked to decide.
   *
   * Everything still queued happened *before* the prompt — the server issues one only after it has
   * applied the state the options describe. Pacing them out behind the question means asking
   * "which of these will you discard?" over a board showing a hand from two turns ago, and a tile
   * the player can see but not choose. So the animations are given up and the state catches up.
   *
   * `docs/08-graphics-ux.md` §4's rule still holds — no animation *delays* input; the action bar
   * is already on screen. This makes the board agree with it.
   *
   * A held result is not skipped: the player has not dismissed the hand they just watched end, and
   * the prompt belongs to the next one.
   */
  catchUpToPrompt(): void {
    if (this.queue.length === 0) return;
    // A result already on screen is not interrupted — that one is waiting on the player.
    if (this._holding()) return;
    this.startCatchUp(true);
    this.drain();
  }

  destroy(): void {
    this.clear();
  }

  private startCatchUp(keepHolds: boolean): void {
    // A catch-up that ignores holds subsumes one that respects them, never the other way round.
    const next = this.catchingUp ? this.catchUpKeepsHolds && keepHolds : keepHolds;
    if (this.catchingUp && next === this.catchUpKeepsHolds) return;

    this.catchingUp = true;
    this.catchUpKeepsHolds = next;
    // A dwell already running belongs to the old, unhurried pace.
    if (this.timer !== null) {
      this.cancelTimer();
      this._holding.set(false);
    }
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.options.scheduler.cancel(this.timer);
    this.timer = null;
  }

  private drain(): void {
    if (this.timer !== null) return;

    for (;;) {
      const next = this.queue.shift();
      if (next === undefined) {
        this.catchingUp = false;
        this.catchUpKeepsHolds = false;
        this._pending.set(0);
        return;
      }
      this._pending.set(this.queue.length);
      this.options.apply(next.event, next.seq);

      const dwell = this.dwellFor(next.event.t);
      if (dwell <= 0) continue;

      this._holding.set(DISMISSIBLE.has(next.event.t));
      this.timer = this.options.scheduler.schedule(() => {
        this.timer = null;
        this._holding.set(false);
        this.drain();
      }, dwell);
      return;
    }
  }

  private dwellFor(type: GameEventType): number {
    if (this.catchingUp) return this.catchUpKeepsHolds && DISMISSIBLE.has(type) ? HOLD_MS : 0;
    const dwell = DWELL_MS[type];
    if (this.options.reducedMotion() && !DISMISSIBLE.has(type)) return 0;
    return dwell;
  }
}
