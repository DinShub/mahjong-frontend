import { beforeEach, describe, expect, it } from 'vitest';

import type { GameEvent } from '@contracts/actions';

import { createTestScheduler } from '@core/time/scheduler';

import { CATCH_UP_THRESHOLD, DWELL_MS, EventQueue, HOLD_MS } from './event-queue';

function discard(tile: string): GameEvent {
  return { t: 'discard', seat: 0, tile: tile as never, tsumogiri: false, riichi: false };
}

const DRAW: GameEvent = { t: 'draw', seat: 0, tile: null, fromRinshan: false, wallRemaining: 60 };

const AGARI: GameEvent = {
  t: 'agari',
  winners: [],
  scores: [25_000, 25_000, 25_000, 25_000],
  scoreDeltas: [0, 0, 0, 0],
};

describe('EventQueue', () => {
  let scheduler: ReturnType<typeof createTestScheduler>;
  let applied: GameEvent[];
  let reduced: boolean;

  function makeQueue(): EventQueue {
    return new EventQueue({
      apply: (event) => {
        applied.push(event);
      },
      scheduler,
      reducedMotion: () => reduced,
    });
  }

  beforeEach(() => {
    scheduler = createTestScheduler();
    applied = [];
    reduced = false;
  });

  it('applies an event immediately and then waits out its dwell', () => {
    const queue = makeQueue();
    queue.push(discard('1m'), 1);
    queue.push(discard('2m'), 2);

    // The first is applied at once — state is never behind what the player has been shown.
    expect(applied).toHaveLength(1);

    scheduler.advance(DWELL_MS.discard - 1);
    expect(applied).toHaveLength(1);

    scheduler.advance(1);
    expect(applied).toHaveLength(2);
  });

  it('runs zero-dwell events straight through without a timer', () => {
    const queue = makeQueue();
    queue.push(DRAW, 1);
    queue.push(DRAW, 2);
    queue.push(DRAW, 3);
    expect(applied).toHaveLength(3);
    expect(scheduler.pending).toBe(0);
  });

  it('collapses dwell once the backlog passes the catch-up threshold', () => {
    const queue = makeQueue();
    // The first push is applied straight away, so the *backlog* only exceeds the threshold on the
    // (threshold + 2)th event. Up to there the queue is pacing normally.
    for (let index = 0; index < CATCH_UP_THRESHOLD + 1; index += 1) {
      queue.push(discard('1m'), index + 1);
    }
    expect(applied).toHaveLength(1);

    queue.push(discard('9m'), CATCH_UP_THRESHOLD + 2);
    // A backgrounded tab comes back to a burst; it drains instantly rather than replaying it.
    expect(applied).toHaveLength(CATCH_UP_THRESHOLD + 2);
    expect(queue.pending()).toBe(0);
  });

  it('catches up past a hold too', () => {
    const queue = makeQueue();
    queue.push(AGARI, 1);
    expect(queue.holding()).toBe(true);

    for (let index = 0; index < CATCH_UP_THRESHOLD + 1; index += 1) {
      queue.push(discard('1m'), index + 2);
    }
    expect(queue.holding()).toBe(false);
    expect(applied).toHaveLength(CATCH_UP_THRESHOLD + 2);
  });

  it('holds on a result until dismissed', () => {
    const queue = makeQueue();
    queue.push(AGARI, 1);
    queue.push(discard('1m'), 2);

    expect(applied).toHaveLength(1);
    expect(queue.holding()).toBe(true);

    scheduler.advance(HOLD_MS - 1);
    expect(applied).toHaveLength(1);

    queue.dismiss();
    expect(queue.holding()).toBe(false);
    expect(applied).toHaveLength(2);
  });

  it('releases a hold on its own after the timeout', () => {
    const queue = makeQueue();
    queue.push(AGARI, 1);
    queue.push(discard('1m'), 2);

    scheduler.advance(HOLD_MS);
    expect(applied).toHaveLength(2);
  });

  it('drops everything queued behind a snapshot', () => {
    const queue = makeQueue();
    queue.push(discard('1m'), 1);
    queue.push(discard('2m'), 2);
    queue.push(discard('3m'), 3);
    expect(applied).toHaveLength(1);

    // Snapshot-over-merge: what is queued describes a world that no longer exists.
    queue.clear();
    scheduler.advance(10_000);

    expect(applied).toHaveLength(1);
    expect(queue.pending()).toBe(0);
    expect(scheduler.pending).toBe(0);
  });

  it('keeps reading time under reduced motion but drops the tweening time', () => {
    reduced = true;
    const queue = makeQueue();
    queue.push(discard('1m'), 1);
    queue.push(discard('2m'), 2);
    // Animation dwell collapses: the state still changes, it just cuts rather than tweens.
    expect(applied).toHaveLength(2);

    queue.push(AGARI, 3);
    queue.push(discard('3m'), 4);
    // A result is reading time, not animation, so it still holds.
    expect(applied).toHaveLength(3);
    expect(queue.holding()).toBe(true);
  });

  it('applies every event exactly once, in order', () => {
    const queue = makeQueue();
    const tiles = ['1m', '2m', '3m', '4m'];
    tiles.forEach((tile, index) => {
      queue.push(discard(tile), index + 1);
    });
    scheduler.flush();

    expect(applied.map((event) => (event.t === 'discard' ? event.tile : ''))).toEqual(tiles);
  });

  it('dismiss does nothing when nothing is holding', () => {
    const queue = makeQueue();
    queue.push(discard('1m'), 1);
    queue.dismiss();
    expect(applied).toHaveLength(1);
  });
});

describe('EventQueue.catchUpToPrompt', () => {
  let scheduler: ReturnType<typeof createTestScheduler>;
  let applied: GameEvent[];

  function makeQueue(): EventQueue {
    return new EventQueue({
      apply: (event) => {
        applied.push(event);
      },
      scheduler,
    });
  }

  beforeEach(() => {
    scheduler = createTestScheduler();
    applied = [];
  });

  it('applies everything still queued, because it all happened before the question', () => {
    const queue = makeQueue();
    queue.push(discard('1m'), 1);
    queue.push(discard('2m'), 2);
    queue.push(DRAW, 3);
    expect(applied).toHaveLength(1);

    queue.catchUpToPrompt();
    // The board now shows the hand the prompt's options describe.
    expect(applied).toHaveLength(3);
    expect(queue.pending()).toBe(0);
  });

  it('stops at a result rather than skipping past it', () => {
    const queue = makeQueue();
    queue.push(discard('1m'), 1);
    queue.push(AGARI, 2);
    queue.push(discard('2m'), 3);

    queue.catchUpToPrompt();
    // The win is applied and held; the next hand's discard waits behind it.
    expect(applied).toHaveLength(2);
    expect(queue.holding()).toBe(true);
  });

  it('leaves a result already on screen alone', () => {
    const queue = makeQueue();
    queue.push(AGARI, 1);
    queue.push(discard('1m'), 2);
    expect(queue.holding()).toBe(true);

    queue.catchUpToPrompt();
    expect(applied).toHaveLength(1);
    expect(queue.holding()).toBe(true);
  });

  it('goes back to pacing once it has caught up', () => {
    const queue = makeQueue();
    queue.push(discard('1m'), 1);
    queue.push(discard('2m'), 2);
    queue.catchUpToPrompt();
    expect(applied).toHaveLength(2);

    queue.push(discard('3m'), 3);
    queue.push(discard('4m'), 4);
    expect(applied).toHaveLength(3);
    scheduler.advance(DWELL_MS.discard);
    expect(applied).toHaveLength(4);
  });
});
