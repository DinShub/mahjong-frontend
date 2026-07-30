import type { Seat, Wind } from '@contracts/actions';

/**
 * Absolute seat vs. render position — kept apart by the type system, not by discipline.
 *
 * A `Seat` is fixed for the whole game and is what every wire payload carries. A {@link SeatPos} is
 * where that seat is drawn *right now*, which depends on who is looking: self is always at the
 * bottom (`docs/08-graphics-ux.md` §2). The two are both small integers, they are wrong in ways
 * that look plausible on screen (an opponent's discard landing in your own pond), and mixing them
 * is the single most likely bug in the render layer.
 *
 * So `SeatPos` is branded. `players[pos]` does not compile; neither does `seatToPos(pos, mySeat)`.
 * The only way from one to the other is through the two functions below.
 */
declare const seatPosBrand: unique symbol;

/** Render position: 0 bottom (self), 1 right, 2 top, 3 left. */
export type SeatPos = number & { readonly [seatPosBrand]: 'SeatPos' };

export const POS_BOTTOM = 0 as SeatPos;
export const POS_RIGHT = 1 as SeatPos;
export const POS_TOP = 2 as SeatPos;
export const POS_LEFT = 3 as SeatPos;

export const SEAT_POSITIONS: readonly SeatPos[] = [POS_BOTTOM, POS_RIGHT, POS_TOP, POS_LEFT];

/** `(seat - mySeat + 4) % 4`. A spectator (`mySeat === null`) puts seat 0 at the bottom. */
export function seatToPos(seat: Seat, mySeat: Seat | null): SeatPos {
  return ((seat - (mySeat ?? 0) + 4) % 4) as SeatPos;
}

/** The inverse: which absolute seat is drawn at this position. */
export function posToSeat(pos: SeatPos, mySeat: Seat | null): Seat {
  return ((pos + (mySeat ?? 0)) % 4) as Seat;
}

/**
 * Degrees the whole seat zone is rotated by, so hand/pond/meld components only ever have to be
 * written for the bottom orientation (`docs/08-graphics-ux.md` §2).
 */
export const POS_ROTATION: Readonly<Record<number, number>> = {
  [POS_BOTTOM]: 0,
  [POS_RIGHT]: -90,
  [POS_TOP]: 180,
  [POS_LEFT]: 90,
};

export function posRotation(pos: SeatPos): number {
  return POS_ROTATION[pos] ?? 0;
}

/** Screen-space name, used for test ids and aria text. */
export const POS_NAME: Readonly<Record<number, 'bottom' | 'right' | 'top' | 'left'>> = {
  [POS_BOTTOM]: 'bottom',
  [POS_RIGHT]: 'right',
  [POS_TOP]: 'top',
  [POS_LEFT]: 'left',
};

export function posName(pos: SeatPos): 'bottom' | 'right' | 'top' | 'left' {
  return POS_NAME[pos] ?? 'bottom';
}

/** Seat wind for a hand: `(seat - dealer + 4) % 4`. Absolute seats only — never positions. */
export function seatWindOf(seat: Seat, dealer: Seat): Wind {
  return ((seat - dealer + 4) % 4) as Wind;
}

export const WIND_KANJI: readonly string[] = ['東', '南', '西', '北'];
export const WIND_NAME: readonly string[] = ['East', 'South', 'West', 'North'];
