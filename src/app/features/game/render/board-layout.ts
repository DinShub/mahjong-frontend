import { POS_BOTTOM, POS_LEFT, POS_RIGHT, POS_TOP, posRotation } from '../state/seat-position';
import type { SeatPos } from '../state/seat-position';

/**
 * Where things sit on the 1600 × 900 stage, in stage units.
 *
 * Positions are plain data, deliberately (`docs/08-graphics-ux.md` §1): the render layer's escape
 * hatch is that swapping DOM for canvas means reimplementing the leaf components, not redoing the
 * layout. Boxes are given by their **centre**, because every one of them may be rotated and a
 * rotation about the centre is the only placement that does not move with the angle.
 */
export interface Box {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotate: number;
}

export function boxStyle(box: Box): Record<string, string> {
  return {
    left: `${String(box.cx)}px`,
    top: `${String(box.cy)}px`,
    width: `${String(box.width)}px`,
    height: `${String(box.height)}px`,
    transform: `translate(-50%, -50%) rotate(${String(box.rotate)}deg)`,
  };
}

const POND_WIDTH = 190;
const POND_HEIGHT = 172;

/** Pond centres, ringing the centre panel. */
const POND_CENTRES: Readonly<Record<number, [number, number]>> = {
  [POS_BOTTOM]: [800, 705],
  [POS_RIGHT]: [1055, 450],
  [POS_TOP]: [800, 218],
  [POS_LEFT]: [545, 450],
};

/**
 * Seat-zone centres and box sizes. The self zone is wider and shallower than the opponents' —
 * 44 × 60 tiles need the height, and it never has to fit inside the stage's 900 after a rotation.
 */
const ZONE_BOXES: Readonly<Record<number, [number, number, number, number]>> = {
  [POS_BOTTOM]: [800, 842, 1240, 96],
  [POS_RIGHT]: [1478, 450, 860, 124],
  [POS_TOP]: [800, 70, 900, 124],
  [POS_LEFT]: [122, 450, 860, 124],
};

export function pondBox(pos: SeatPos): Box {
  const [cx, cy] = POND_CENTRES[pos] ?? [800, 705];
  return { cx, cy, width: POND_WIDTH, height: POND_HEIGHT, rotate: posRotation(pos) };
}

export function seatZoneBox(pos: SeatPos): Box {
  const [cx, cy, width, height] = ZONE_BOXES[pos] ?? [800, 842, 1240, 96];
  return { cx, cy, width, height, rotate: posRotation(pos) };
}

export const CENTRE_BOX: Box = { cx: 800, cy: 450, width: 280, height: 280, rotate: 0 };
export const ACTION_BOX: Box = { cx: 1330, cy: 726, width: 500, height: 120, rotate: 0 };
