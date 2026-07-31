import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { STANDARD_RULES } from '@contracts/actions';
import type { GameEvent, PlayerInfo, Seat } from '@contracts/actions';
import { STATS_ROUTES } from '@contracts/stats';
import type { ReplayLog } from '@contracts/stats';

import { APP_CONFIG } from '@core/config/app-config';
import { SCHEDULER, createTestScheduler } from '@core/time/scheduler';

import { ReplayStore } from './replay.store';

const API = 'http://api.test';
const GAME_ID = '65a1b2c3d4e5f60718293a4b';

const PLAYERS: PlayerInfo[] = [0, 1, 2, 3].map((seat) => ({
  userId: seat === 0 ? '65a1b2c3d4e5f60718293a4c' : null,
  displayName: seat === 0 ? 'Human' : `Bot ${String(seat)}`,
  avatarId: 'default',
  isBot: seat !== 0,
  botLevel: seat === 0 ? null : 'normal',
}));

function handStart(handIndex: number, dealer: Seat): GameEvent {
  return {
    t: 'hand-start',
    handIndex,
    round: 0,
    kyoku: handIndex + 1,
    honba: 0,
    riichiSticks: 0,
    dealer,
    scores: [25_000, 25_000, 25_000, 25_000],
    // Unredacted, as the endpoint serves it for a finished game.
    hands: [['1m'], ['2p'], ['3s'], ['4z']],
    doraIndicator: '5m',
  };
}

function draw(seat: Seat, tile: string, wallRemaining: number): GameEvent {
  return { t: 'draw', seat, tile: tile as never, fromRinshan: false, wallRemaining };
}

function discard(seat: Seat, tile: string): GameEvent {
  return { t: 'discard', seat, tile: tile as never, tsumogiri: false, riichi: false };
}

/**
 * A two-hand game: deal, a draw and a discard each, then a tsumo; deal again, one discard.
 *
 * Small on purpose. What the store has to get right is the *indexing* — which events belong to
 * which hand, where a seek lands, what a viewer sees — and none of that gets more true with a
 * thousand events in front of it.
 */
const EVENTS: GameEvent[] = [
  { t: 'game-start', config: STANDARD_RULES, players: PLAYERS, seedHash: 'a'.repeat(64) },
  handStart(0, 0),
  draw(0, '9m', 69),
  discard(0, '1m'),
  draw(1, '9p', 68),
  {
    t: 'agari',
    winners: [
      {
        seat: 1,
        from: 1,
        hand: ['2p'],
        melds: [],
        winningTile: '9p',
        han: 1,
        fu: 30,
        points: 1000,
        yaku: [{ name: 'menzen_tsumo', han: 1 }],
        yakuman: [],
        dora: 0,
        uraDora: 0,
        redDora: 0,
        scoreDeltas: [-300, 1000, -350, -350],
        limitName: null,
      },
    ],
    scores: [24_700, 26_000, 24_650, 24_650],
    scoreDeltas: [-300, 1000, -350, -350],
  },
  { t: 'hand-end', riichiSticks: 0, nextDealer: 1, nextHonba: 0 },
  handStart(1, 1),
  discard(1, '2p'),
];

function log(overrides: Partial<ReplayLog> = {}): ReplayLog {
  return {
    gameId: GAME_ID,
    config: STANDARD_RULES,
    length: 'hanchan',
    players: PLAYERS,
    userIds: [PLAYERS[0]!.userId, null, null, null],
    seed: 'the-seed',
    seedHash: 'a'.repeat(64),
    placements: [0, 1, 2, 3].map((seat) => ({
      seat: seat as Seat,
      place: (seat + 1) as 1 | 2 | 3 | 4,
      finalScore: 25_000,
      netScore: 0,
    })),
    hands: [
      {
        index: 0,
        round: 0,
        kyoku: 1,
        honba: 0,
        dealer: 0,
        result: 'tsumo',
        startEvent: 1,
        endEvent: 7,
        scoreDeltas: [-300, 1000, -350, -350],
        scoresAfter: [24_700, 26_000, 24_650, 24_650],
        winners: [{ seat: 1, han: 1, fu: 30, points: 1000, yaku: ['menzen_tsumo'] }],
      },
      {
        index: 1,
        round: 0,
        kyoku: 2,
        honba: 0,
        dealer: 1,
        result: 'ryuukyoku',
        startEvent: 7,
        endEvent: 9,
        scoreDeltas: [0, 0, 0, 0],
        scoresAfter: [24_700, 26_000, 24_650, 24_650],
        winners: [],
      },
    ],
    events: EVENTS,
    startedAt: '2026-07-31T10:00:00.000Z',
    endedAt: '2026-07-31T10:40:00.000Z',
    ...overrides,
  };
}

describe('ReplayStore', () => {
  let store: ReplayStore;
  let http: HttpTestingController;
  let scheduler: ReturnType<typeof createTestScheduler>;

  beforeEach(() => {
    scheduler = createTestScheduler();
    TestBed.configureTestingModule({
      providers: [
        ReplayStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SCHEDULER, useValue: scheduler },
        { provide: APP_CONFIG, useValue: { apiUrl: API, socketUrl: API } },
      ],
    });
    store = TestBed.inject(ReplayStore);
    http = TestBed.inject(HttpTestingController);
  });

  async function load(body: unknown = log()): Promise<void> {
    const pending = store.load(GAME_ID);
    http.expectOne(`${API}${STATS_ROUTES.replay(GAME_ID)}`).flush(body as object);
    await pending;
  }

  describe('loading', () => {
    it('validates the response and opens on the first human seat', async () => {
      await load();
      expect(store.error()).toBeNull();
      expect(store.total()).toBe(EVENTS.length);
      expect(store.viewer()).toBe(0);
      expect(store.cursor()).toBe(0);
    });

    it('reports a live game as a refusal, not as a crash', async () => {
      const pending = store.load(GAME_ID);
      http
        .expectOne(`${API}${STATS_ROUTES.replay(GAME_ID)}`)
        .flush({ code: 'GAME_NOT_FINISHED' }, { status: 403, statusText: 'Forbidden' });
      await pending;
      expect(store.error()).toContain('still being played');
      expect(store.log()).toBeNull();
    });

    it('refuses a log that does not match the contract', async () => {
      await load({ gameId: GAME_ID, events: 'not an array' });
      expect(store.error()).not.toBeNull();
      expect(store.log()).toBeNull();
    });
  });

  describe('the fold', () => {
    it('shows the deal after the first hand-start and nothing before it', async () => {
      await load();
      expect(store.view()?.players[0]?.discards).toEqual([]);

      store.seek(1);
      expect(store.view()?.players[0]?.hand).toEqual(['1m']);

      store.seek(3);
      expect(store.view()?.players[0]?.discards.map((d) => d.tile)).toEqual(['1m']);
    });

    it('redacts to what a seat saw, and reveals everything only in all mode', async () => {
      await load();
      store.seek(2);

      // Seat 0 sees its own hand and its own draw, and no one else's.
      expect(store.view()?.players[0]?.hand).toEqual(['1m']);
      expect(store.view()?.players[1]?.hand).toBeNull();

      store.setViewer(1);
      expect(store.view()?.players[1]?.hand).toEqual(['2p']);
      expect(store.view()?.players[0]?.hand).toBeNull();
      // Seat 0's draw is another player's tile from seat 1's chair.
      expect(store.view()?.players[0]?.drawn).toBeNull();

      store.setViewer('all');
      expect(store.revealAll()).toBe(true);
      expect(store.view()?.players.map((player) => player.hand)).toEqual([
        ['1m'],
        ['2p'],
        ['3s'],
        ['4z'],
      ]);
      expect(store.view()?.players[0]?.drawn).toBe('9m');
    });

    it('keeps the board facing the seat that was being watched when all mode is turned on', async () => {
      await load();
      store.setViewer(2);
      expect(store.view()?.mySeat).toBe(2);
      store.setViewer('all');
      expect(store.view()?.mySeat).toBe(2);
    });

    it('is the same view whether it arrived by stepping or by seeking', async () => {
      await load();
      for (let index = 0; index < 5; index++) store.step(1);
      const stepped = store.view();

      store.seek(0);
      store.seek(5);
      expect(store.view()).toEqual(stepped);
    });
  });

  describe('the transport', () => {
    it('seeks to the start of a hand, and rewinds to the top of the current one first', async () => {
      await load();
      store.seek(4);
      expect(store.currentHand()?.index).toBe(0);

      store.seekHand(1);
      expect(store.cursor()).toBe(7);
      expect(store.currentHand()?.index).toBe(1);

      // Mid-hand: back goes to this hand's own start, the way a video player behaves.
      store.seek(8);
      store.seekHand(-1);
      expect(store.cursor()).toBe(7);
      // Already at the start: back goes to the previous hand.
      store.seekHand(-1);
      expect(store.cursor()).toBe(1);
    });

    it('clamps rather than running off either end', async () => {
      await load();
      store.seek(-5);
      expect(store.cursor()).toBe(0);
      store.seek(9999);
      expect(store.cursor()).toBe(store.total());
      expect(store.atEnd()).toBe(true);
    });

    it('advances one event per step while playing, and stops at the end', async () => {
      await load();
      store.play();
      expect(store.playing()).toBe(true);

      scheduler.advance(700);
      expect(store.cursor()).toBe(1);
      scheduler.advance(700);
      expect(store.cursor()).toBe(2);

      store.seek(store.total() - 1);
      store.play();
      scheduler.advance(700);
      expect(store.atEnd()).toBe(true);
      expect(store.playing()).toBe(false);
    });

    it('goes faster at a higher speed', async () => {
      await load();
      store.setSpeed(4);
      store.play();
      scheduler.advance(175);
      expect(store.cursor()).toBe(1);
    });

    it('restarts from the beginning when play is pressed at the end', async () => {
      await load();
      store.seek(store.total());
      store.play();
      expect(store.cursor()).toBe(0);
      expect(store.playing()).toBe(true);
    });

    it('stops the timer when a step interrupts playback', async () => {
      await load();
      store.play();
      store.step(1);
      expect(store.playing()).toBe(false);
      const cursor = store.cursor();
      scheduler.advance(5000);
      expect(store.cursor()).toBe(cursor);
    });
  });

  describe('the hand result', () => {
    it('surfaces the agari once the cursor has reached it, and not before', async () => {
      await load();
      store.seek(4);
      expect(store.handResult()).toBeNull();

      store.seek(5);
      expect(store.handResult()).toMatchObject({ t: 'agari' });
    });

    it('drops it again once the next hand has started', async () => {
      await load();
      store.seek(5);
      expect(store.handResult()).toMatchObject({ t: 'agari' });
      store.seek(8);
      expect(store.handResult()).toBeNull();
    });
  });
});
