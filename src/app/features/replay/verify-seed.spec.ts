import { describe, expect, it } from 'vitest';

import { tileIdToStr } from '@contracts/tiles';
import type { GameEvent } from '@contracts/actions';
import type { ReplayLog } from '@contracts/stats';
import { STANDARD_RULES } from '@contracts/actions';

import { buildWall, dealToSeats, doraIndicatorOf, verifyReplay } from './verify-seed';

/**
 * Golden values, produced by the **server's** engine
 * (`backend/src/engine/{rng,wall}.ts`, seed `m5-verify-seed`).
 *
 * This is the whole value of the file. `verify-seed.ts` is a deliberate second implementation of
 * the wall derivation — see its header — and a second implementation is only worth having if
 * something holds it to the first. These constants are that something: if either side's shuffle,
 * seeding or deal order changes, this test fails, and one of the two is wrong.
 */
const SEED = 'm5-verify-seed';
const SEED_HASH = '0fcaf928259d7dff8b2079ad76b79a6d961711711755df4a4321e25c9330099a';
const WALL_HEAD = [118, 38, 48, 37, 5, 7];
const DORA_ID = 65;
const HAND0 = [
  ['1p', '1p', '1s', '3z', '3z', '4m', '4p', '4s', '4z', '5s', '5z', '8m', '9m'],
  ['1m', '1p', '2m', '2m', '3m', '3p', '4s', '5p', '6p', '6p', '6z', '9p', '9s'],
  ['1p', '2p', '2z', '3s', '4z', '7s', '7s', '7z', '7z', '7z', '8s', '9p', '9s'],
  ['0m', '0p', '1s', '1s', '2s', '2z', '4z', '5p', '6m', '6s', '7s', '8s', '9p'],
] as const;
const HAND3_DEALER3 = {
  seat0: ['1m', '1p', '1p', '1s', '2m', '3z', '4p', '5m', '5m', '5p', '6p', '7m', '9p'],
  seat3: ['0s', '1s', '1s', '2p', '2z', '3m', '4m', '4m', '5s', '6z', '7z', '8p', '9s'],
} as const;

function sorted(ids: readonly number[]): string[] {
  return ids.map(tileIdToStr).sort();
}

function handStart(
  handIndex: number,
  dealer: 0 | 1 | 2 | 3,
  hands: readonly (readonly string[])[],
): GameEvent {
  return {
    t: 'hand-start',
    handIndex,
    round: 0,
    kyoku: handIndex + 1,
    honba: 0,
    riichiSticks: 0,
    dealer,
    scores: [25_000, 25_000, 25_000, 25_000],
    hands: hands.map((hand) => [...hand]) as GameEvent extends { t: 'hand-start' }
      ? never
      : never[],
    doraIndicator: '5m',
  } as GameEvent;
}

function log(overrides: Partial<ReplayLog> = {}): ReplayLog {
  return {
    gameId: '65a1b2c3d4e5f60718293a4b',
    config: STANDARD_RULES,
    length: 'hanchan',
    players: [0, 1, 2, 3].map((seat) => ({
      userId: null,
      displayName: `P${String(seat)}`,
      avatarId: 'default',
      isBot: false,
      botLevel: null,
    })),
    userIds: [null, null, null, null],
    seed: SEED,
    seedHash: SEED_HASH,
    placements: [0, 1, 2, 3].map((seat) => ({
      seat: seat as 0 | 1 | 2 | 3,
      place: (seat + 1) as 1 | 2 | 3 | 4,
      finalScore: 25_000,
      netScore: 0,
    })),
    hands: [],
    events: [handStart(0, 0, HAND0)],
    startedAt: '2026-07-31T10:00:00.000Z',
    endedAt: '2026-07-31T10:40:00.000Z',
    ...overrides,
  };
}

describe('the wall derivation matches the server', () => {
  it('produces the engine’s wall for a known seed', async () => {
    const wall = await buildWall(SEED, 0);
    expect(wall).toHaveLength(136);
    expect(wall.slice(0, 6)).toEqual(WALL_HEAD);
    expect(new Set(wall).size).toBe(136);
  });

  it('deals the engine’s hands for a dealer in seat 0', async () => {
    const dealt = dealToSeats(await buildWall(SEED, 0), 0);
    for (const seat of [0, 1, 2, 3] as const) {
      expect(sorted(dealt[seat]), `seat ${String(seat)}`).toEqual([...HAND0[seat]]);
    }
  });

  it('rotates the deal with the dealer', async () => {
    const dealt = dealToSeats(await buildWall(SEED, 3), 3);
    expect(sorted(dealt[0])).toEqual([...HAND3_DEALER3.seat0]);
    expect(sorted(dealt[3])).toEqual([...HAND3_DEALER3.seat3]);
  });

  it('finds the first dora indicator where the dead wall keeps it', async () => {
    expect(doraIndicatorOf(await buildWall(SEED, 0))).toBe(DORA_ID);
  });

  it('gives a different wall per hand index', async () => {
    const first = await buildWall(SEED, 0);
    const second = await buildWall(SEED, 1);
    expect(first).not.toEqual(second);
  });
});

describe('verifyReplay', () => {
  it('accepts a log whose deal follows from its seed', async () => {
    const verdict = await verifyReplay(log());
    expect(verdict.status).toBe('ok');
    expect(verdict).toMatchObject({ hands: [{ handIndex: 0, matches: true }] });
  });

  it('rejects a seed that does not hash to what was published', async () => {
    // The failure this whole mechanism exists for: a server that picked the wall after seeing the
    // hands and published a seed to match. The commitment was made before the deal and cannot be
    // moved afterwards.
    const verdict = await verifyReplay(log({ seed: 'not-the-seed' }));
    expect(verdict.status).toBe('hash-mismatch');
    expect(verdict).toMatchObject({ published: SEED_HASH });
  });

  it('rejects a deal that the seed does not produce', async () => {
    const tampered = [...HAND0.map((hand) => [...hand])];
    tampered[0]![0] = '1m';
    const verdict = await verifyReplay(log({ events: [handStart(0, 0, tampered)] }));
    expect(verdict.status).toBe('deal-mismatch');
    expect(verdict).toMatchObject({ hands: [{ handIndex: 0, matches: false }] });
  });

  it('checks every hand in the log, not only the first', async () => {
    const verdict = await verifyReplay(
      log({
        events: [
          handStart(0, 0, HAND0),
          handStart(3, 3, [
            HAND3_DEALER3.seat0,
            HAND0[1],
            HAND0[2],
            HAND3_DEALER3.seat3,
          ]),
        ],
      }),
    );
    // Hand 3's seats 1 and 2 are deliberately wrong, so the verdict must be a mismatch and must
    // name hand 3 rather than hand 0.
    expect(verdict.status).toBe('deal-mismatch');
    expect(verdict).toMatchObject({
      hands: [
        { handIndex: 0, matches: true },
        { handIndex: 3, matches: false },
      ],
    });
  });

  it('reports a log with nothing dealt as unverifiable rather than as fraud', async () => {
    const verdict = await verifyReplay(log({ events: [] }));
    expect(verdict).toMatchObject({ status: 'unverifiable' });
  });
});
