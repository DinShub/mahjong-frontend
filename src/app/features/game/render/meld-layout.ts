import { isRedTileStr } from '@contracts/tiles';
import type { MeldWire, Seat } from '@contracts/actions';
import type { TileStr } from '@contracts/tiles';

/**
 * Where the rotated tile goes.
 *
 * The sideways tile in a meld says **who it was taken from**, and every player at the table reads
 * it without thinking — it is how you know, three turns later, that the pon on your left came off
 * *your* discard. `docs/08-graphics-ux.md` §2 calls this out as something that must be exact, so it
 * lives in a pure function with tests rather than inside a template.
 *
 * Relative seat is `(from - owner + 4) % 4`, the contract's own convention: 1 is shimocha (the
 * next player in turn order, drawn to the owner's right), 3 is kamicha (the previous one, drawn to
 * the owner's left). Chi can only ever be 3.
 *
 * | Source        | Rotated tile |
 * | ------------- | ------------ |
 * | kamicha (3)   | left end     |
 * | toimen (2)    | middle       |
 * | shimocha (1)  | right end    |
 */
export interface MeldColumn {
  /** Bottom-first. Two entries only for the added tile of a shouminkan. */
  tiles: (TileStr | null)[];
  rotated: boolean;
}

export function rotatedIndex(meld: MeldWire, owner: Seat): number {
  if (meld.from === null) return -1;
  const relative = (meld.from - owner + 4) % 4;
  const width = meld.type === 'shouminkan' ? 3 : meld.tiles.length;
  switch (relative) {
    case 3:
      return 0;
    case 2:
      // Second position for a kan as well as a pon: "middle" of four has no single answer, and
      // putting it second keeps the kan reading the same as the pon it may have grown from.
      return 1;
    case 1:
      return width - 1;
    default:
      // A meld sourced from the owner is a shouminkan on their own pon in a malformed payload.
      return 0;
  }
}

/** Two face-up, two face-down — and a red five is never one of the hidden ones. */
function ankanColumns(meld: MeldWire): MeldColumn[] {
  const sorted = [...meld.tiles].sort((a, b) => Number(isRedTileStr(b)) - Number(isRedTileStr(a)));
  const [faceUpA, faceUpB] = sorted;
  return [
    { tiles: [null], rotated: false },
    { tiles: [faceUpA ?? null], rotated: false },
    { tiles: [faceUpB ?? null], rotated: false },
    { tiles: [null], rotated: false },
  ];
}

function openColumns(meld: MeldWire, owner: Seat): MeldColumn[] {
  const target = rotatedIndex(meld, owner);
  const called = meld.calledTile;
  const rest = [...meld.tiles];

  // Take the called copy out and put it back at the position that names its source.
  if (called !== null) {
    const at =
      meld.calledIndex !== null && rest[meld.calledIndex] === called
        ? meld.calledIndex
        : rest.indexOf(called);
    if (at !== -1) rest.splice(at, 1);
  }

  const ordered: (TileStr | null)[] = [];
  const width = meld.tiles.length;
  for (let index = 0; index < width; index += 1) {
    ordered.push(index === target ? called : (rest.shift() ?? null));
  }
  return ordered.map((tile, index) => ({ tiles: [tile], rotated: index === target }));
}

function shouminkanColumns(meld: MeldWire, owner: Seat): MeldColumn[] {
  const target = rotatedIndex(meld, owner);
  const called = meld.calledTile;
  const rest = [...meld.tiles];
  if (called !== null) {
    const at = rest.indexOf(called);
    if (at !== -1) rest.splice(at, 1);
  }
  // Of the three left, one was added on top of the rotated tile and two sit flat.
  const added = rest.pop() ?? null;

  const columns: MeldColumn[] = [];
  for (let index = 0; index < 3; index += 1) {
    if (index === target) columns.push({ tiles: [called, added], rotated: true });
    else columns.push({ tiles: [rest.shift() ?? null], rotated: false });
  }
  return columns;
}

export function layoutMeld(meld: MeldWire, owner: Seat): MeldColumn[] {
  if (meld.type === 'ankan') return ankanColumns(meld);
  if (meld.type === 'shouminkan') return shouminkanColumns(meld, owner);
  return openColumns(meld, owner);
}

/** Spoken form, for the live region and the meld's own label. */
export function meldLabel(meld: MeldWire): string {
  const kind =
    meld.type === 'daiminkan' || meld.type === 'shouminkan' || meld.type === 'ankan'
      ? 'kan'
      : meld.type;
  const concealed = meld.type === 'ankan' ? 'concealed ' : '';
  return `${concealed}${kind}`;
}
