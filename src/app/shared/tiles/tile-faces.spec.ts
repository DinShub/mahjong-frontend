import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ALL_TILE_STRS } from '@contracts/tiles';

import {
  FACE_VIEWBOX,
  FALLBACK_TILE_SET,
  TILE_SETS,
  TILE_SET_INFO,
  backSymbolId,
  faceMarkup,
  faceSymbolId,
  spriteMarkup,
} from './tile-faces';

/**
 * Two face sets from two different places, so there are two different things to check.
 *
 * The inline set is generated, so what matters is that it is *complete* and *distinct* — a missing
 * face renders as an empty tile that still lays out correctly, which is exactly the bug that
 * survives a manual look at the board, because you would have to notice that the one tile you never
 * drew is blank.
 *
 * The fetched set is a build artefact, so what matters is that the file the app asks for exists,
 * covers all 37 faces plus a back, and uses the ids the app will look up. Those two lists are
 * maintained in different files — `tile-faces.ts` and `scripts/build-tile-sprite.mjs` — and this is
 * what stops them drifting apart.
 */
describe('tile set registry', () => {
  it('describes every set exactly once', () => {
    expect(TILE_SETS.length).toBe(Object.keys(TILE_SET_INFO).length);
    for (const set of TILE_SETS) expect(TILE_SET_INFO[set].id).toBe(set);
  });

  it('gives the sets different id prefixes so both can be in one document', () => {
    const prefixes = TILE_SETS.map((set) => TILE_SET_INFO[set].idPrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const tile of ALL_TILE_STRS) {
      expect(faceSymbolId(tile, 'traditional')).not.toBe(faceSymbolId(tile, 'high-contrast'));
    }
  });

  it('has an inline fallback, so a failed fetch is never a blank board', () => {
    expect(TILE_SET_INFO[FALLBACK_TILE_SET].source.kind).toBe('inline');
  });
});

describe('the inline set', () => {
  const set = FALLBACK_TILE_SET;

  it('draws all 37 faces', () => {
    for (const tile of ALL_TILE_STRS) {
      expect(faceMarkup(tile, set), `${tile} has no face`).not.toBe('');
    }
  });

  it('draws each face differently from every other', () => {
    const seen = new Map<string, string>();
    for (const tile of ALL_TILE_STRS) {
      const markup = faceMarkup(tile, set);
      const clash = seen.get(markup);
      expect(clash, `${tile} and ${clash ?? ''} are drawn identically`).toBeUndefined();
      seen.set(markup, tile);
    }
  });

  it('gives every face a symbol with the shared viewBox', () => {
    const sprite = spriteMarkup(set);
    for (const tile of ALL_TILE_STRS) {
      expect(sprite).toContain(`id="${faceSymbolId(tile, set)}"`);
    }
    expect(sprite.split('<symbol').length - 1).toBe(ALL_TILE_STRS.length);
    expect(sprite.split(`viewBox="${FACE_VIEWBOX}"`).length - 1).toBe(ALL_TILE_STRS.length);
  });

  it('is balanced markup that fetches nothing', () => {
    const sprite = spriteMarkup(set);
    expect(sprite.split('<symbol').length).toBe(sprite.split('</symbol>').length);
    expect(sprite).not.toContain('NaN');
    expect(sprite).not.toContain('undefined');
    expect(sprite).not.toMatch(/https?:/);
    expect(sprite).not.toContain('<image');
  });

  it('marks a red five red, and the dragons by their own colours', () => {
    for (const red of ['0m', '0p', '0s'] as const) {
      expect(faceMarkup(red, set)).toContain('--mj-face-red');
    }
    expect(faceMarkup('5z', set)).toContain('--mj-face-blue');
    expect(faceMarkup('6z', set)).toContain('--mj-face-green');
    expect(faceMarkup('7z', set)).toContain('--mj-face-red');
  });

  it('tells a wind from a dragon in words as well as a letter', () => {
    expect(faceMarkup('1z', set)).toContain('WIND');
    expect(faceMarkup('7z', set)).toContain('DRAGON');
  });

  it('generates nothing for a fetched set — those symbols are not this module to make', () => {
    expect(spriteMarkup('traditional')).toBe('');
    expect(faceMarkup('1m', 'traditional')).toBe('');
  });
});

describe('the fetched sheet', () => {
  const info = TILE_SET_INFO.traditional;
  const source = info.source;
  const sheet = readFileSync(join(process.cwd(), 'public', 'tiles', 'traditional.svg'), 'utf8');

  it('is served from where the app asks for it', () => {
    expect(source.kind).toBe('fetch');
    if (source.kind !== 'fetch') return;
    expect(source.url).toBe('tiles/traditional.svg');
  });

  it('has a symbol for all 37 faces, under the ids the app looks up', () => {
    for (const tile of ALL_TILE_STRS) {
      expect(sheet, `${tile} is missing from the sheet`).toContain(
        `id="${faceSymbolId(tile, 'traditional')}"`,
      );
    }
  });

  it('has the face-down tile the set claims to draw', () => {
    const back = backSymbolId('traditional');
    expect(back).not.toBeNull();
    expect(sheet).toContain(`id="${back ?? ''}"`);
  });

  it('is 38 symbols and no more', () => {
    expect(sheet.split('<symbol').length - 1).toBe(ALL_TILE_STRS.length + 1);
  });

  it('has no duplicate ids across the merged documents', () => {
    // 38 Inkscape files reusing `defs4` and `linearGradient4` would cross-wire the gradients and
    // `<use>` references — silently, since the pin tiles are drawn almost entirely from `<use>`.
    const ids = [...sheet.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id ?? '', (counts.get(id ?? '') ?? 0) + 1);
    const duplicates = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
    expect(duplicates).toEqual([]);
  });

  it('fetches nothing itself and carries no editor metadata', () => {
    expect(sheet).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(sheet).not.toContain('<image');
    expect(sheet).not.toContain('sodipodi');
    expect(sheet).not.toContain('inkscape');
    expect(sheet).not.toContain('<metadata');
  });

  it('says it is generated, so nobody edits it by hand', () => {
    expect(sheet).toContain('GENERATED');
    expect(sheet).toContain('build:tiles');
  });
});
