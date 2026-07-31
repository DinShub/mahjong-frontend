import { describe, expect, it } from 'vitest';

import { replayLogSchema } from '@contracts/schemas';
import type { ReplayLog } from '@contracts/stats';

import { loadReplayFixture } from '@features/game/state/fixtures';

import { verifyReplay } from './verify-seed';

/**
 * The published replay, end to end.
 *
 * `test-fixtures/replay.json` is a complete game the **backend engine** played and published
 * (`npm run emit:fixtures`), synced here and drift-checked in both CIs. Two things are checked
 * against it, and neither could be checked against a fixture written on this side:
 *
 * 1. The response the server declares in `contracts/stats.ts` is the response it actually emits —
 *    the log parses against the schema both sides share.
 * 2. The client's wall derivation agrees with the engine's. `verify-seed.ts` is a deliberate
 *    second implementation of the shuffle; here it re-derives eight hands from the seed and finds
 *    the tiles the engine dealt. If either side's PRNG, seeding or deal order changes, this fails.
 */
describe('the published replay fixture', () => {
  const log = replayLogSchema.parse(loadReplayFixture()) as ReplayLog;

  it('parses against the contract the server serves it under', () => {
    expect(log.events.length).toBeGreaterThan(100);
    expect(log.hands.length).toBeGreaterThan(0);
    expect(log.players).toHaveLength(4);
    expect(log.placements.map((placement) => placement.place).sort()).toEqual([1, 2, 3, 4]);
  });

  it('is unredacted, which is what makes all-revealed possible', () => {
    const start = log.events.find((event) => event.t === 'hand-start');
    expect(start).toBeDefined();
    // Every seat's opening hand is present. A projected log has `null` in three of the four.
    expect(start?.t === 'hand-start' ? start.hands.map((hand) => hand?.length) : []).toEqual([
      13, 13, 13, 13,
    ]);
  });

  it('indexes each hand onto a real slice of the event array', () => {
    for (const hand of log.hands) {
      expect(hand.endEvent).toBeGreaterThan(hand.startEvent);
      expect(log.events[hand.startEvent]?.t).toBe('hand-start');
      expect(hand.endEvent).toBeLessThanOrEqual(log.events.length);
    }
    // Contiguous: no event belongs to no hand.
    for (const [index, hand] of log.hands.slice(1).entries()) {
      expect(hand.startEvent).toBe(log.hands[index]!.endEvent);
    }
  });

  it('verifies against a wall this client derives itself', async () => {
    const verdict = await verifyReplay(log);
    expect(verdict.status).toBe('ok');
    expect(verdict).toMatchObject({ hands: log.hands.map(() => ({ matches: true })) });
  });

  it('fails verification if the seed is altered by one character', async () => {
    const tampered: ReplayLog = { ...log, seed: `${log.seed}x` };
    expect((await verifyReplay(tampered)).status).toBe('hash-mismatch');
  });
});
