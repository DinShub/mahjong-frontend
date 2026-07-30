import { InjectionToken } from '@angular/core';

export type TimerHandle = number;

/**
 * Every delayed thing in the client goes through here.
 *
 * The event queue's dwell times, the deadline ring and the countdown all need a clock, and all
 * three are only testable if the clock can be driven by hand. `vi.useFakeTimers()` would work for
 * the timers but not for `now()`, and the queue's behaviour depends on both.
 */
export interface Scheduler {
  now(): number;
  schedule(callback: () => void, delayMs: number): TimerHandle;
  cancel(handle: TimerHandle): void;
  /** Every animation frame until cancelled. Used only where something is genuinely animating. */
  frame(callback: () => void): TimerHandle;
  cancelFrame(handle: TimerHandle): void;
}

export const realScheduler: Scheduler = {
  now: () => Date.now(),
  schedule: (callback, delayMs) => globalThis.setTimeout(callback, delayMs) as unknown as number,
  cancel: (handle) => {
    globalThis.clearTimeout(handle);
  },
  frame: (callback) => globalThis.requestAnimationFrame(callback),
  cancelFrame: (handle) => {
    globalThis.cancelAnimationFrame(handle);
  },
};

export const SCHEDULER = new InjectionToken<Scheduler>('SCHEDULER', {
  providedIn: 'root',
  factory: () => realScheduler,
});

/**
 * A scheduler a test drives.
 *
 * `advance()` runs every callback whose deadline has passed, in order, including ones scheduled by
 * the callbacks it just ran — which is exactly the case the event queue produces when a dwell
 * expires and the next event has one of its own.
 */
export function createTestScheduler(startMs = 0): Scheduler & {
  advance(ms: number): void;
  flush(): void;
  readonly pending: number;
} {
  interface Entry {
    handle: TimerHandle;
    at: number;
    callback: () => void;
    isFrame: boolean;
  }

  let current = startMs;
  let nextHandle = 1;
  let entries: Entry[] = [];

  function runDue(): void {
    for (;;) {
      const due = entries
        .filter((entry) => entry.at <= current)
        .sort((a, b) => a.at - b.at || a.handle - b.handle);
      const next = due[0];
      if (next === undefined) return;
      entries = entries.filter((entry) => entry !== next);
      next.callback();
    }
  }

  return {
    now: () => current,
    schedule(callback, delayMs) {
      const handle = nextHandle++;
      entries.push({ handle, at: current + delayMs, callback, isFrame: false });
      return handle;
    },
    cancel(handle) {
      entries = entries.filter((entry) => entry.handle !== handle);
    },
    frame(callback) {
      const handle = nextHandle++;
      entries.push({ handle, at: current, callback, isFrame: true });
      return handle;
    },
    cancelFrame(handle) {
      entries = entries.filter((entry) => entry.handle !== handle);
    },
    advance(ms) {
      current += ms;
      runDue();
    },
    /**
     * Run everything, including work scheduled by the work being run — a dwell expiring and the
     * next event declaring one of its own is the whole shape of the event queue, so a single jump
     * to the furthest known deadline would stop one link short.
     */
    flush() {
      let guard = 0;
      while (entries.length > 0) {
        if (guard++ > 10_000) throw new Error('flush(): timers are rescheduling forever');
        current = entries.reduce((max, entry) => Math.max(max, entry.at), current);
        runDue();
      }
    },
    get pending() {
      return entries.length;
    },
  };
}
