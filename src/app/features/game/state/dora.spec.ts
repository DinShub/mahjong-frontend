import { describe, expect, it } from 'vitest';

import { ALL_TILE_STRS, kindToStr, tileStrToKind } from '@contracts/tiles';
import type { TileStr } from '@contracts/tiles';

import { doraKinds, isDora } from './dora';

/**
 * The dora outline in your own hand is a reading aid and nothing more — the dora *count* in a win
 * arrives inside `AgariResult` and is never recomputed. What is worth pinning is the wrap-around,
 * which is the part everyone gets wrong, and the red five, which is dora with no indicator at all.
 */
describe('doraKinds', () => {
  it('reads the tile after the indicator', () => {
    expect([...doraKinds(['1m' as TileStr])].map(kindToStr)).toEqual(['2m']);
    expect([...doraKinds(['5p' as TileStr])].map(kindToStr)).toEqual(['6p']);
  });

  it('wraps within each suit and each honour group', () => {
    expect([...doraKinds(['9s' as TileStr])].map(kindToStr)).toEqual(['1s']);
    // North wraps to East, not to a dragon; Chun wraps to Haku, not to a wind.
    expect([...doraKinds(['4z' as TileStr])].map(kindToStr)).toEqual(['1z']);
    expect([...doraKinds(['7z' as TileStr])].map(kindToStr)).toEqual(['5z']);
  });

  it('takes a red five as its ordinary five', () => {
    expect([...doraKinds(['0p' as TileStr])].map(kindToStr)).toEqual(['6p']);
  });

  it('collects every revealed indicator', () => {
    const kinds = doraKinds(['1m', '9s', '7z'] as TileStr[]);
    expect(kinds.size).toBe(3);
  });

  it('never points at a tile that does not exist', () => {
    for (const indicator of ALL_TILE_STRS) {
      for (const kind of doraKinds([indicator])) {
        expect(kind).toBeGreaterThanOrEqual(0);
        expect(kind).toBeLessThan(34);
      }
    }
  });
});

describe('isDora', () => {
  const kinds = doraKinds(['1m' as TileStr]);

  it('marks the indicated kind', () => {
    expect(isDora('2m' as TileStr, kinds)).toBe(true);
    expect(isDora('3m' as TileStr, kinds)).toBe(false);
  });

  it('marks a red five whatever the indicators say', () => {
    for (const red of ['0m', '0p', '0s'] as TileStr[]) {
      expect(isDora(red, new Set())).toBe(true);
    }
    // …and the ordinary five of the same kind is not.
    expect(isDora('5p' as TileStr, new Set())).toBe(false);
  });

  it('does not confuse a red five with its kind when that kind is dora', () => {
    const fiveIsDora = doraKinds(['4p' as TileStr]);
    expect(fiveIsDora.has(tileStrToKind('5p' as TileStr))).toBe(true);
    expect(isDora('5p' as TileStr, fiveIsDora)).toBe(true);
    // The red one is dora twice over in scoring; here it is simply outlined once.
    expect(isDora('0p' as TileStr, fiveIsDora)).toBe(true);
  });
});
