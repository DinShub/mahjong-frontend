import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { GAME_HISTORY_PAGE_SIZE, ME, STATS_ROUTES } from '@contracts/stats';
import type { GameSummary, PlayerStatsView, UserProfile } from '@contracts/stats';

import { APP_CONFIG } from '@core/config/app-config';

import { ProfileStore } from './profile.store';

const API = 'http://api.test';
const USER = '65a1b2c3d4e5f60718293a4c';

function stats(overrides: Partial<PlayerStatsView> = {}): PlayerStatsView {
  return {
    userId: USER,
    games: 4,
    hanchan: 4,
    tonpuusen: 0,
    placements: [2, 1, 1, 0],
    avgPlacement: 1.75,
    totalNetScore: 30,
    busts: 0,
    hands: 32,
    wins: 8,
    winRate: 0.25,
    dealIns: 4,
    dealInRate: 0.125,
    tsumoWins: 3,
    riichiDeclared: 10,
    riichiRate: 0.3125,
    riichiWinRate: 0.5,
    callRate: 0.2,
    tenpaiAtDraw: 3,
    drawsPlayed: 5,
    avgWinPoints: 5200,
    avgDealInPoints: 4800,
    avgWinTurn: 10.5,
    yakuCounts: { riichi: 10, tanyao: 4, pinfu: 2 },
    yakumanCount: 0,
    updatedAt: '2026-07-31T10:00:00.000Z',
    ...overrides,
  };
}

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: USER,
    displayName: 'Subject',
    avatarId: 'default',
    isGuest: false,
    createdAt: '2026-06-01T10:00:00.000Z',
    stats: stats(),
    ...overrides,
  };
}

function game(id: string): GameSummary {
  return {
    gameId: id,
    status: 'finished',
    length: 'hanchan',
    isPrivate: false,
    hands: 8,
    players: [0, 1, 2, 3].map((seat) => ({
      seat: seat as 0 | 1 | 2 | 3,
      userId: seat === 0 ? USER : null,
      displayName: seat === 0 ? 'Subject' : `Bot ${String(seat)}`,
      avatarId: 'default',
      isBot: seat !== 0,
      botLevel: seat === 0 ? null : 'normal',
      finalScore: 30_000 - seat * 2000,
      placement: (seat + 1) as 1 | 2 | 3 | 4,
      netScore: 20 - seat * 10,
    })),
    seat: 0,
    seedHash: 'a'.repeat(64),
    seed: 'the-seed',
    startedAt: '2026-07-30T10:00:00.000Z',
    endedAt: '2026-07-30T10:40:00.000Z',
    durationMs: 2_400_000,
  };
}

describe('ProfileStore', () => {
  let store: ProfileStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProfileStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiUrl: API, socketUrl: API } },
      ],
    });
    store = TestBed.inject(ProfileStore);
    http = TestBed.inject(HttpTestingController);
  });

  async function load(
    body: unknown = profile(),
    page: unknown = { games: [game('a'.repeat(24))], nextCursor: null, total: 1 },
  ): Promise<void> {
    const pending = store.load();
    http.expectOne(`${API}${STATS_ROUTES.profile(ME)}`).flush(body as object);
    http
      .expectOne(`${API}${STATS_ROUTES.games(ME)}?limit=${String(GAME_HISTORY_PAGE_SIZE)}`)
      .flush(page as object);
    await pending;
  }

  it('loads the profile and the first page together', async () => {
    await load();
    expect(store.error()).toBeNull();
    expect(store.profile()?.displayName).toBe('Subject');
    expect(store.games()).toHaveLength(1);
    expect(store.total()).toBe(1);
    expect(store.hasMore()).toBe(false);
  });

  it('turns the placement counts into shares of games played', async () => {
    await load();
    expect(store.placementShares()).toEqual([
      { place: 1, count: 2, share: 0.5 },
      { place: 2, count: 1, share: 0.25 },
      { place: 3, count: 1, share: 0.25 },
      { place: 4, count: 0, share: 0 },
    ]);
  });

  it('shows a new player four empty bars rather than dividing by zero', async () => {
    await load(
      profile({ stats: stats({ games: 0, placements: [0, 0, 0, 0], avgPlacement: 0 }) }),
      { games: [], nextCursor: null, total: 0 },
    );
    expect(store.placementShares().every((bar) => bar.share === 0)).toBe(true);
    expect(store.games()).toEqual([]);
  });

  it('appends the next page rather than replacing the list', async () => {
    await load(profile(), {
      games: [game('a'.repeat(24))],
      nextCursor: 'b'.repeat(24),
      total: 2,
    });
    expect(store.hasMore()).toBe(true);

    const pending = store.loadMore();
    http
      .expectOne(
        `${API}${STATS_ROUTES.games(ME)}?limit=${String(GAME_HISTORY_PAGE_SIZE)}&cursor=${'b'.repeat(24)}`,
      )
      .flush({ games: [game('c'.repeat(24))], nextCursor: null, total: 2 });
    await pending;

    expect(store.games().map((entry) => entry.gameId)).toEqual(['a'.repeat(24), 'c'.repeat(24)]);
    expect(store.hasMore()).toBe(false);
  });

  it('does nothing when asked for more with no cursor', async () => {
    await load();
    await store.loadMore();
    http.verify();
  });

  it('reports an unknown player as a message, not an exception', async () => {
    const pending = store.load(USER);
    http
      .expectOne(`${API}${STATS_ROUTES.profile(USER)}`)
      .flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    http
      .expectOne(`${API}${STATS_ROUTES.games(USER)}?limit=${String(GAME_HISTORY_PAGE_SIZE)}`)
      .flush({ games: [], nextCursor: null, total: 0 });
    await pending;
    expect(store.error()).toBe('No such player.');
    expect(store.profile()).toBeNull();
  });

  it('refuses a response that does not match the contract', async () => {
    await load({ userId: USER, displayName: 'Subject' });
    expect(store.error()).not.toBeNull();
    expect(store.profile()).toBeNull();
  });
});
