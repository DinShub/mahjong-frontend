import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { SocketService } from '@core/socket/socket.service';
import { SCHEDULER } from '@core/time/scheduler';
import type { TimerHandle } from '@core/time/scheduler';

import { GameStore } from '../state/game.store';

/** How often the ring redraws. Not a rAF loop — a table is idle most of the time. */
const TICK_MS = 100;

/**
 * Above this RTT the countdown is shown short by the round trip.
 *
 * `docs/07-frontend.md` §6: a player on a slow link must not be cut off by lag they cannot see.
 * Their action has to *reach* the server before the deadline, so the honest thing to display is
 * the deadline minus the time the action will spend in flight. Below 400 ms the correction is
 * noise and pretending otherwise just makes everyone's clock look wrong.
 */
export const RTT_DISPLAY_THRESHOLD_MS = 400;

@Injectable({ providedIn: 'root' })
export class PromptClock {
  private readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);
  private readonly scheduler = inject(SCHEDULER);

  private readonly _remainingMs = signal<number | null>(null);
  private totalMs = 0;
  private timer: TimerHandle | null = null;

  readonly remainingMs = this._remainingMs.asReadonly();

  readonly remainingSeconds = computed(() => {
    const remaining = this._remainingMs();
    return remaining === null ? null : Math.max(0, Math.ceil(remaining / 1000));
  });

  /** `1` full, `0` expired, `null` when nothing is pending. */
  readonly progress = computed(() => {
    const remaining = this._remainingMs();
    if (remaining === null || this.totalMs <= 0) return null;
    return Math.min(1, Math.max(0, remaining / this.totalMs));
  });

  readonly urgent = computed(() => {
    const seconds = this.remainingSeconds();
    return seconds !== null && seconds <= 3;
  });

  constructor() {
    effect(() => {
      const prompt = this.store.prompt();
      this.stop();
      if (prompt === null) {
        this._remainingMs.set(null);
        return;
      }
      this.totalMs = Math.max(1, prompt.deadline - this.serverNow());
      this.tick(prompt.deadline);
    });
  }

  private tick(deadline: number): void {
    const rtt = this.socket.rttMs() ?? 0;
    const allowance = rtt > RTT_DISPLAY_THRESHOLD_MS ? rtt : 0;
    const remaining = deadline - this.serverNow() - allowance;
    this._remainingMs.set(Math.max(0, remaining));
    if (remaining <= 0) return;
    this.timer = this.scheduler.schedule(() => {
      this.tick(deadline);
    }, TICK_MS);
  }

  private stop(): void {
    if (this.timer === null) return;
    this.scheduler.cancel(this.timer);
    this.timer = null;
  }

  /** Deadlines are server epoch times; the local clock is not authoritative and may be minutes out. */
  private serverNow(): number {
    return this.scheduler.now() + (this.socket.clockSkewMs() ?? 0);
  }
}
