import { describe, expect, it } from 'vitest';

import { SEATS } from '@contracts/actions';
import type { Seat } from '@contracts/actions';

import {
  POS_BOTTOM,
  POS_LEFT,
  POS_RIGHT,
  POS_TOP,
  SEAT_POSITIONS,
  posName,
  posRotation,
  posToSeat,
  seatToPos,
  seatWindOf,
} from './seat-position';

/**
 * Absolute seat versus render position — the mistake that looks plausible on screen.
 *
 * A swap between the two puts an opponent's discard in your own pond, and the board still renders,
 * which is why the two are separate types and why the conversion has tests of its own rather than
 * living inline in a template.
 */
describe('seatToPos', () => {
  it('puts the viewer at the bottom, whoever they are', () => {
    for (const seat of SEATS) {
      expect(seatToPos(seat, seat)).toBe(POS_BOTTOM);
    }
  });

  it('places the other three in turn order clockwise from the viewer', () => {
    // Seat 1 is shimocha — the next to play — and is drawn to the viewer's right.
    expect(seatToPos(1, 0)).toBe(POS_RIGHT);
    expect(seatToPos(2, 0)).toBe(POS_TOP);
    expect(seatToPos(3, 0)).toBe(POS_LEFT);

    expect(seatToPos(0, 2)).toBe(POS_TOP);
    expect(seatToPos(1, 2)).toBe(POS_LEFT);
    expect(seatToPos(3, 2)).toBe(POS_RIGHT);
  });

  it('seats a spectator behind seat 0', () => {
    expect(seatToPos(0, null)).toBe(POS_BOTTOM);
    expect(seatToPos(2, null)).toBe(POS_TOP);
  });

  it('round-trips through posToSeat for every viewer', () => {
    for (const viewer of [...SEATS, null] as (Seat | null)[]) {
      for (const seat of SEATS) {
        expect(posToSeat(seatToPos(seat, viewer), viewer)).toBe(seat);
      }
      // …and the four positions are always a permutation of the four seats.
      const seats = SEAT_POSITIONS.map((pos) => posToSeat(pos, viewer));
      expect([...seats].sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('rotates each zone so the bottom layout can be written once', () => {
    expect(posRotation(POS_BOTTOM)).toBe(0);
    expect(posRotation(POS_RIGHT)).toBe(-90);
    expect(posRotation(POS_TOP)).toBe(180);
    expect(posRotation(POS_LEFT)).toBe(90);
  });

  it('names positions for test ids and labels', () => {
    expect(SEAT_POSITIONS.map(posName)).toEqual(['bottom', 'right', 'top', 'left']);
  });
});

describe('seatWindOf', () => {
  it('makes the dealer East and counts round the table', () => {
    expect(seatWindOf(2, 2)).toBe(0);
    expect(seatWindOf(3, 2)).toBe(1);
    expect(seatWindOf(0, 2)).toBe(2);
    expect(seatWindOf(1, 2)).toBe(3);
  });

  it('gives all four winds out exactly once, whoever deals', () => {
    for (const dealer of SEATS) {
      const winds = SEATS.map((seat) => seatWindOf(seat, dealer));
      expect([...winds].sort()).toEqual([0, 1, 2, 3]);
    }
  });
});
