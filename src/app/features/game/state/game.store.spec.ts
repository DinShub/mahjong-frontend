import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ClientAction, GameEvent, Placement } from '@contracts/actions';
import type { Ack, ServerToClientEvents } from '@contracts/protocol';
import type { Prompt } from '@contracts/views';

import { SocketService } from '@core/socket/socket.service';
import { SCHEDULER, createTestScheduler } from '@core/time/scheduler';

import { GameStore } from './game.store';
import { eventsOf, loadFixture } from './fixtures';

type Listeners = {
  [E in keyof ServerToClientEvents]?: ServerToClientEvents[E][];
};

/**
 * A socket that records what was sent and lets a test push what arrives.
 *
 * Not a mock of the transport — a stand-in for the *service*, which is the seam the store is
 * written against. Everything below is the store reacting to a wire it has no other way to reach.
 */
class FakeSocket {
  readonly sent: { event: string; payload: unknown }[] = [];
  readonly listeners: Listeners = {};
  ack: Ack = { ok: true };
  demoted = () => false;
  rttMs = () => 40;
  clockSkewMs = () => 0;

  on<E extends keyof ServerToClientEvents>(
    event: E,
    listener: ServerToClientEvents[E],
  ): () => void {
    const list = (this.listeners[event] ??= []) as ServerToClientEvents[E][];
    list.push(listener);
    return () => {
      const index = list.indexOf(listener);
      if (index >= 0) list.splice(index, 1);
    };
  }

  request(event: string, payload: unknown): Promise<Ack> {
    this.sent.push({ event, payload });
    return Promise.resolve(this.ack);
  }

  emit<E extends keyof ServerToClientEvents>(
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    for (const listener of (this.listeners[event] ?? []) as ServerToClientEvents[E][]) {
      (listener as (...a: unknown[]) => void)(...args);
    }
  }
}

const FIXTURE = loadFixture('chankan');

function promptOf(options: ClientAction[], id = 'p1'): Prompt {
  return { promptId: id, seat: FIXTURE.mySeat, options, deadline: 0, bankRemaining: 20 };
}

const ENDED: { placements: Placement[]; seed: string; seedHash: string } = {
  placements: [
    { seat: 0, place: 1, finalScore: 40_000, netScore: 60 },
    { seat: 1, place: 2, finalScore: 30_000, netScore: 10 },
    { seat: 2, place: 3, finalScore: 20_000, netScore: -10 },
    { seat: 3, place: 4, finalScore: 10_000, netScore: -60 },
  ],
  seed: 'seed',
  seedHash: 'hash',
};

describe('GameStore', () => {
  let socket: FakeSocket;
  let scheduler: ReturnType<typeof createTestScheduler>;
  let store: GameStore;

  beforeEach(() => {
    socket = new FakeSocket();
    scheduler = createTestScheduler();
    TestBed.configureTestingModule({
      providers: [
        { provide: SocketService, useValue: socket },
        { provide: SCHEDULER, useValue: scheduler },
      ],
    });
    store = TestBed.inject(GameStore);
    store.attach(FIXTURE.snapshot.tableId);
  });

  function snapshot(seq = FIXTURE.snapshot.seq): void {
    socket.emit('game:snapshot', { seq, view: { ...FIXTURE.snapshot, seq } });
  }

  function event(seq: number, payload: GameEvent): void {
    socket.emit('game:event', { seq, ts: 0, payload });
  }

  const events = eventsOf(FIXTURE);

  it('adopts a snapshot wholesale', () => {
    snapshot();
    expect(store.view()?.tableId).toBe(FIXTURE.snapshot.tableId);
    expect(store.mySeat()).toBe(FIXTURE.mySeat);
  });

  it('ignores a snapshot for another table', () => {
    socket.emit('game:snapshot', {
      seq: 1,
      view: { ...FIXTURE.snapshot, tableId: 'somebody-elses-table' },
    });
    expect(store.view()).toBeNull();
  });

  it('applies events in order behind the snapshot', () => {
    snapshot();
    const [first, second] = events;
    event(first!.seq, first!.event);
    scheduler.flush();
    event(second!.seq, second!.event);
    scheduler.flush();
    expect(store.view()?.lastEventSeq).toBe(second!.seq);
  });

  it('drops a duplicate rather than applying it twice', () => {
    snapshot();
    const [first] = events;
    event(first!.seq, first!.event);
    scheduler.flush();
    const wall = store.wallRemaining();

    event(first!.seq, first!.event);
    scheduler.flush();
    expect(store.wallRemaining()).toBe(wall);
    expect(socket.sent.filter((message) => message.event === 'game:resync')).toHaveLength(0);
  });

  it('asks for a snapshot on a seq gap instead of guessing', () => {
    snapshot();
    const [first] = events;
    event(first!.seq, first!.event);
    scheduler.flush();

    // Something was missed and cannot be reconstructed: stop, and ask.
    event(first!.seq + 4, events[4]!.event);

    const resyncs = socket.sent.filter((message) => message.event === 'game:resync');
    expect(resyncs).toHaveLength(1);
    expect(resyncs[0]?.payload).toEqual({ tableId: FIXTURE.snapshot.tableId });
    expect(store.resyncing()).toBe(true);
  });

  it('does not ask again inside the server rate limit', () => {
    snapshot();
    event(events[0]!.seq + 4, events[4]!.event);
    event(events[0]!.seq + 6, events[6]!.event);
    expect(socket.sent.filter((message) => message.event === 'game:resync')).toHaveLength(1);

    // Two seconds later it is allowed to ask again.
    scheduler.advance(2_000);
    event(events[0]!.seq + 8, events[8]!.event);
    expect(socket.sent.filter((message) => message.event === 'game:resync')).toHaveLength(2);
  });

  it('throws away everything queued when a snapshot lands', () => {
    snapshot();
    for (const step of events.slice(0, 3)) event(step.seq, step.event);

    snapshot(999);
    scheduler.flush();

    expect(store.view()?.seq).toBe(999);
    expect(store.queue.pending()).toBe(0);
  });

  // -------------------------------------------------------------------------

  it('sends the prompt id with the action', async () => {
    snapshot();
    socket.emit('game:prompt', promptOf([{ type: 'pass' }]));
    await store.submit({ type: 'pass' });

    expect(socket.sent.at(-1)).toEqual({
      event: 'game:action',
      payload: {
        tableId: FIXTURE.snapshot.tableId,
        promptId: 'p1',
        action: { type: 'pass' },
      },
    });
  });

  it('refuses to submit twice for the same prompt', async () => {
    snapshot();
    socket.emit('game:prompt', promptOf([{ type: 'pass' }]));
    await store.submit({ type: 'pass' });
    await store.submit({ type: 'pass' });
    expect(socket.sent.filter((message) => message.event === 'game:action')).toHaveLength(1);
  });

  it('clears a prompt the server withdrew', () => {
    snapshot();
    socket.emit('game:prompt', promptOf([{ type: 'pass' }]));
    socket.emit('game:promptCancelled', { promptId: 'p1', reason: 'superseded' });
    expect(store.prompt()).toBeNull();
  });

  it('keeps a prompt when a different one is cancelled', () => {
    snapshot();
    socket.emit('game:prompt', promptOf([{ type: 'pass' }], 'p2'));
    socket.emit('game:promptCancelled', { promptId: 'p1', reason: 'timeout' });
    expect(store.prompt()?.promptId).toBe('p2');
  });

  it('resyncs when the server says an action was illegal', async () => {
    snapshot();
    socket.ack = { ok: false, error: { code: 'ILLEGAL_ACTION', message: 'no' } };
    socket.emit('game:prompt', promptOf([{ type: 'pass' }]));
    await store.submit({ type: 'pass' });

    expect(store.actionError()).toBe('no');
    expect(socket.sent.filter((message) => message.event === 'game:resync')).toHaveLength(1);
  });

  it('treats a stale prompt as ordinary, not as an error to show', async () => {
    snapshot();
    socket.ack = { ok: false, error: { code: 'STALE_PROMPT', message: 'gone' } };
    socket.emit('game:prompt', promptOf([{ type: 'pass' }]));
    await store.submit({ type: 'pass' });

    expect(store.actionError()).toBeNull();
    expect(socket.sent.filter((message) => message.event === 'game:resync')).toHaveLength(0);
  });

  // -------------------------------------------------------------------------

  describe('pre-selection', () => {
    beforeEach(() => {
      snapshot();
    });

    function actions(): unknown[] {
      return socket.sent
        .filter((message) => message.event === 'game:action')
        .map((message) => (message.payload as { action: unknown }).action);
    }

    it('fires auto-pass the instant a matching prompt arrives', () => {
      store.togglePreSelection('autoPass');
      socket.emit(
        'game:prompt',
        promptOf([{ type: 'chi', tiles: ['3m', '4m'] }, { type: 'pass' }]),
      );
      expect(actions()).toEqual([{ type: 'pass' }]);
    });

    it('never passes on a win', () => {
      store.togglePreSelection('autoPass');
      socket.emit('game:prompt', promptOf([{ type: 'ron' }, { type: 'pass' }]));
      expect(actions()).toEqual([]);
    });

    it('takes a win when auto-win is armed', () => {
      store.togglePreSelection('autoWin');
      socket.emit('game:prompt', promptOf([{ type: 'ron' }, { type: 'pass' }]));
      expect(actions()).toEqual([{ type: 'ron' }]);
    });

    it('stands down from auto-discard when a decision is on offer', () => {
      store.togglePreSelection('autoTsumogiri');
      socket.emit('game:prompt', promptOf([{ type: 'tsumo' }, { type: 'discard', tile: '1m' }]));
      expect(actions()).toEqual([]);

      socket.emit(
        'game:prompt',
        promptOf([{ type: 'kyuushu' }, { type: 'discard', tile: '1m' }], 'p2'),
      );
      expect(actions()).toEqual([]);
    });

    it('is cleared when the hand ends', () => {
      store.togglePreSelection('autoPass');
      expect(store.preSelection().autoPass).toBe(true);

      event(FIXTURE.snapshot.seq + 1, {
        t: 'hand-end',
        nextDealer: 0,
        nextHonba: 1,
        riichiSticks: 0,
      });
      scheduler.flush();

      expect(store.preSelection().autoPass).toBe(false);
    });
  });

  it('marks a seat as taken over by a bot and gives it back on reconnect', () => {
    snapshot();
    socket.emit('player:afk', { seat: 1, takenOverByBot: true });
    expect(store.botTakeover()).toEqual([1]);
    expect(store.view()?.players[1]?.connection).toBe('bot');

    socket.emit('player:reconnected', { seat: 1 });
    expect(store.botTakeover()).toEqual([]);
    expect(store.view()?.players[1]?.connection).toBe('online');
  });

  it('puts a result away when the player continues', () => {
    snapshot();
    for (const step of events) event(step.seq, step.event);
    scheduler.flush();
    expect(store.lastAgari() ?? store.lastRyuukyoku()).not.toBeNull();

    store.dismissOverlay();
    // The last hand of a game has no `hand-start` behind it to clear the overlay, so "Continue"
    // has to do it or the button does nothing.
    expect(store.lastAgari()).toBeNull();
    expect(store.lastRyuukyoku()).toBeNull();
  });

  it('withholds the standings until the hand that produced them has been read', () => {
    snapshot();
    for (const step of events) event(step.seq, step.event);
    scheduler.flush();
    expect(store.lastAgari() ?? store.lastRyuukyoku(), 'a result is on screen').not.toBeNull();

    // `game:ended` does not come through the queue: it arrives the moment the server has finished
    // writing the game, which is while the last hand is still being read.
    socket.emit('game:ended', { tableId: FIXTURE.snapshot.tableId, ...ENDED });

    // Held back: the scoreboard would otherwise cover the winning hand that explains it.
    expect(store.gameEnd(), 'the summary itself has arrived').not.toBeNull();
    expect(store.finalStandings(), 'but it is not on screen yet').toBeNull();

    store.dismissOverlay();
    scheduler.flush();
    expect(store.finalStandings()).not.toBeNull();
    expect(store.finalStandings()?.placements).toHaveLength(4);
  });

  it('does not put the standings up over a hand still being replayed', () => {
    snapshot();
    for (const step of events) event(step.seq, step.event);
    // Deliberately no flush: the queue is still paying out the last hand, dwell by dwell, and the
    // agari has not reached the screen yet. This is the ordinary case — the server finishes writing
    // the game well before the client has finished showing it.
    socket.emit('game:ended', { tableId: FIXTURE.snapshot.tableId, ...ENDED });

    expect(store.queue.pending(), 'the hand is still queued').toBeGreaterThan(0);
    expect(store.finalStandings()).toBeNull();

    scheduler.flush();
    store.dismissOverlay();
    scheduler.flush();
    expect(store.finalStandings()).not.toBeNull();
  });

  it('publishes the score changes a result caused, and clears them next hand', () => {
    snapshot();
    for (const step of events) event(step.seq, step.event);
    scheduler.flush();

    const deltas = store.scoreDeltas();
    expect(deltas).toHaveLength(4);
    // A seat that neither paid nor was paid shows nothing rather than a ±0.
    expect(deltas.some((delta) => delta !== null)).toBe(true);
    expect(deltas.every((delta) => delta !== 0)).toBe(true);

    event(events.at(-1)!.seq + 1, {
      t: 'hand-start',
      handIndex: 9,
      round: 0,
      kyoku: 4,
      honba: 0,
      riichiSticks: 0,
      dealer: 3,
      scores: [25_000, 25_000, 25_000, 25_000],
      hands: [null, null, null, null],
      doraIndicator: '1z',
    });
    scheduler.flush();
    expect(store.scoreDeltas()).toEqual([]);
  });

  it('forgets everything on detach', () => {
    snapshot();
    store.detach();
    expect(store.view()).toBeNull();
    expect(store.tableId()).toBeNull();
    expect(store.prompt()).toBeNull();
  });

  it('does not act for a demoted tab', async () => {
    snapshot();
    socket.demoted = () => true;
    socket.emit('game:prompt', promptOf([{ type: 'pass' }]));
    const result = await store.submit({ type: 'pass' });
    expect(result).toBeNull();
    expect(socket.sent.filter((message) => message.event === 'game:action')).toHaveLength(0);
  });

  it('plays a whole recorded hand through the queue and lands on the engine state', () => {
    snapshot();
    for (const step of events) event(step.seq, step.event);
    scheduler.flush();

    expect(store.view()?.scores).toEqual(FIXTURE.final.scores);
    expect(store.view()?.phase).toBe(FIXTURE.final.phase);
    expect(store.lastAgari() ?? store.lastRyuukyoku()).not.toBeNull();
  });

  it('surfaces the last applied event for the live region', () => {
    snapshot();
    for (const step of events.slice(0, 6)) event(step.seq, step.event);
    scheduler.flush();
    expect(store.lastEvent()?.t).toBe(events[5]?.event.t);
  });
});
