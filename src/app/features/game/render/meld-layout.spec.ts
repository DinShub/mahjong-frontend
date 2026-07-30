import { describe, expect, it } from 'vitest';

import type { MeldWire, Seat } from '@contracts/actions';
import type { TileStr } from '@contracts/tiles';

import { loadAllFixtures } from '../state/fixtures';
import { layoutMeld, meldLabel, rotatedIndex } from './meld-layout';

/**
 * The sideways tile says who the meld was taken from, and players read it without thinking.
 * `docs/08-graphics-ux.md` §2 calls it out as something that must be exact.
 */

function meld(partial: Partial<MeldWire> & Pick<MeldWire, 'type' | 'tiles'>): MeldWire {
  return {
    calledTile: partial.tiles[0] ?? null,
    from: 0,
    calledIndex: 0,
    ...partial,
  };
}

const CHI: MeldWire = meld({
  type: 'chi',
  tiles: ['3m', '4m', '5m'] as TileStr[],
  calledTile: '3m' as TileStr,
  calledIndex: 0,
});

const PON: MeldWire = meld({
  type: 'pon',
  tiles: ['7p', '7p', '7p'] as TileStr[],
  calledTile: '7p' as TileStr,
  calledIndex: 0,
});

describe('rotatedIndex', () => {
  it('puts a call from the left player at the left end', () => {
    // Kamicha is `(owner + 3) % 4`; a chi can only ever come from there.
    expect(rotatedIndex({ ...CHI, from: 3 }, 0)).toBe(0);
    expect(rotatedIndex({ ...PON, from: 0 }, 1)).toBe(0);
  });

  it('puts a call from across in the middle', () => {
    expect(rotatedIndex({ ...PON, from: 2 }, 0)).toBe(1);
    expect(rotatedIndex({ ...PON, from: 3 }, 1)).toBe(1);
  });

  it('puts a call from the right player at the right end', () => {
    expect(rotatedIndex({ ...PON, from: 1 }, 0)).toBe(2);
    const kan: MeldWire = {
      ...PON,
      type: 'daiminkan',
      tiles: ['7p', '7p', '7p', '7p'] as TileStr[],
      from: 1,
    };
    expect(rotatedIndex(kan, 0)).toBe(3);
  });

  it('has nothing to rotate for a concealed kan', () => {
    expect(rotatedIndex({ ...PON, type: 'ankan', from: null }, 0)).toBe(-1);
  });
});

describe('layoutMeld', () => {
  it('rotates exactly one column of an open meld, and it holds the called tile', () => {
    const columns = layoutMeld({ ...CHI, from: 3 }, 0);
    expect(columns).toHaveLength(3);
    expect(columns.filter((column) => column.rotated)).toHaveLength(1);
    expect(columns[0]?.rotated).toBe(true);
    expect(columns[0]?.tiles).toEqual(['3m']);
    // The other two tiles came out of the hand and keep their order.
    expect(columns.slice(1).flatMap((column) => column.tiles)).toEqual(['4m', '5m']);
  });

  it('stacks a shouminkan on the rotated tile of the pon it extends', () => {
    const kan: MeldWire = {
      type: 'shouminkan',
      tiles: ['7p', '7p', '7p', '7p'] as TileStr[],
      calledTile: '7p' as TileStr,
      calledIndex: 0,
      from: 2,
    };
    const columns = layoutMeld(kan, 0);
    // Three columns wide, like the pon; the fourth tile goes on top of the rotated one.
    expect(columns).toHaveLength(3);
    const rotated = columns.filter((column) => column.rotated);
    expect(rotated).toHaveLength(1);
    expect(rotated[0]?.tiles).toHaveLength(2);
    expect(columns.flatMap((column) => column.tiles)).toHaveLength(4);
  });

  it('renders a concealed kan as two face-down and two face-up', () => {
    const ankan: MeldWire = {
      type: 'ankan',
      tiles: ['1z', '1z', '1z', '1z'] as TileStr[],
      calledTile: null,
      calledIndex: null,
      from: null,
    };
    const columns = layoutMeld(ankan, 0);
    expect(columns.map((column) => column.tiles[0])).toEqual([null, '1z', '1z', null]);
    expect(columns.every((column) => !column.rotated)).toBe(true);
  });

  it('never hides a red five in a concealed kan', () => {
    const ankan: MeldWire = {
      type: 'ankan',
      tiles: ['5s', '5s', '0s', '5s'] as TileStr[],
      calledTile: null,
      calledIndex: null,
      from: null,
    };
    const faceUp = layoutMeld(ankan, 0)
      .map((column) => column.tiles[0])
      .filter((tile) => tile !== null);
    expect(faceUp).toContain('0s');
  });

  it('lays out every meld in every recorded game without losing a tile', () => {
    for (const fixture of loadAllFixtures()) {
      for (const seat of fixture.final.players) {
        for (const wire of seat.melds) {
          const columns = layoutMeld(wire, seat.seat as Seat);
          const tiles = columns.flatMap((column) => column.tiles);
          expect(tiles).toHaveLength(wire.tiles.length);
          // Concealed kan aside, every tile in the meld is shown.
          const shown = tiles.filter((tile) => tile !== null);
          expect(shown).toHaveLength(wire.type === 'ankan' ? 2 : wire.tiles.length);
          expect(columns.filter((column) => column.rotated)).toHaveLength(
            wire.type === 'ankan' ? 0 : 1,
          );
        }
      }
    }
  });
});

describe('meldLabel', () => {
  it('says what kind of set it is', () => {
    expect(meldLabel(CHI)).toBe('chi');
    expect(meldLabel(PON)).toBe('pon');
    expect(meldLabel({ ...PON, type: 'daiminkan' })).toBe('kan');
    expect(meldLabel({ ...PON, type: 'shouminkan' })).toBe('kan');
    expect(meldLabel({ ...PON, type: 'ankan' })).toBe('concealed kan');
  });
});
