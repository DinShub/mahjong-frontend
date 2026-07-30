import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ALL_TILE_STRS } from '@contracts/tiles';
import type { TileStr } from '@contracts/tiles';

import { SettingsService } from '@core/settings/settings.service';

import { TileComponent } from './tile.component';
import { FALLBACK_TILE_SET, backSymbolId, faceSymbolId } from './tile-faces';
import { TileSpriteService } from './tile-sprite.service';

describe('TileComponent', () => {
  let fixture: ComponentFixture<TileComponent>;
  let settings: SettingsService;

  function render(patch: Record<string, unknown>): HTMLElement {
    for (const [key, value] of Object.entries(patch)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TileComponent] });
    fixture = TestBed.createComponent(TileComponent);
    settings = TestBed.inject(SettingsService);
    settings.reset();
  });

  it('points at the face symbol for the current set', () => {
    const host = render({ tile: '5p' });
    const use = host.querySelector('use');
    expect(use?.getAttribute('href')).toBe(`#${faceSymbolId('5p', 'traditional')}`);

    settings.set('tileSet', 'high-contrast');
    fixture.detectChanges();
    expect(host.querySelector('use')?.getAttribute('href')).toBe(
      `#${faceSymbolId('5p', 'high-contrast')}`,
    );
  });

  it('draws the set’s own back when it is face down and the set has one', () => {
    const host = render({ tile: null });
    expect(host.classList.contains('back')).toBe(true);
    expect(host.getAttribute('aria-label')).toBe('face-down tile');
    // The vendored art includes a back, so a face-down tile is that drawing rather than a slab.
    expect(host.querySelector('use')?.getAttribute('href')).toBe(`#${backSymbolId('traditional')}`);
  });

  it('falls back to the CSS back for a set that draws no back of its own', () => {
    settings.set('tileSet', 'high-contrast');
    const host = render({ tile: null });
    expect(backSymbolId('high-contrast')).toBeNull();
    expect(host.querySelector('svg')).toBeNull();
    expect(host.classList.contains('back')).toBe(true);
  });

  it('keeps its slab under a face and stands it down under the vendored back', () => {
    // Upstream's faces are the design alone on a transparent ground — the slab they sit on is
    // `Front.svg`, which is not vendored because the CSS body *is* that slab. Suppressing it here
    // is what put painted designs on the felt with no tiles under them.
    let host = render({ tile: '5p' });
    expect(host.classList.contains('whole-tile')).toBe(false);

    // `Back.svg`, though, is a finished tile: two slabs is a border inside a border.
    host = render({ tile: null });
    expect(host.classList.contains('whole-tile')).toBe(true);

    settings.set('tileSet', 'high-contrast');
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    expect(host.classList.contains('whole-tile')).toBe(false);
  });

  it('falls back to the inline set when the sheet could not be fetched', () => {
    const sprite = TestBed.inject(TileSpriteService);
    // Nothing to draw with is worse than plainer art: 136 blank slabs is a broken board.
    vi.spyOn(sprite, 'failed').mockReturnValue(['traditional']);

    const host = render({ tile: '5p' });
    expect(host.querySelector('use')?.getAttribute('href')).toBe(
      `#${faceSymbolId('5p', FALLBACK_TILE_SET)}`,
    );
  });

  it('names every tile in both namings', () => {
    const host = render({ tile: '0p' });
    expect(host.getAttribute('aria-label')).toBe('5 of circles, red');

    settings.set('tileNaming', 'japanese');
    fixture.detectChanges();
    expect(host.getAttribute('aria-label')).toBe('aka 5 pin');
  });

  it('gives every one of the 37 faces a label in both namings', () => {
    for (const naming of ['western', 'japanese'] as const) {
      settings.set('tileNaming', naming);
      const seen = new Set<string>();
      for (const tile of ALL_TILE_STRS) {
        const host = render({ tile: tile as TileStr });
        const label = host.getAttribute('aria-label') ?? '';
        expect(label.length).toBeGreaterThan(0);
        expect(label).not.toBe(tile);
        seen.add(label);
      }
      // No two tiles share a label — an ambiguous one is worse than none.
      expect(seen.size).toBe(ALL_TILE_STRS.length);
    }
  });

  it('is an image by default and a button when it can be acted on', () => {
    expect(render({ tile: '1m' }).getAttribute('role')).toBe('img');

    const host = render({ tile: '1m', interactive: true });
    expect(host.getAttribute('role')).toBe('button');
    expect(host.getAttribute('tabindex')).toBe('0');
  });

  it('is not reachable by keyboard when it cannot be chosen', () => {
    const host = render({ tile: '1m', interactive: true, disabled: true });
    expect(host.getAttribute('tabindex')).toBeNull();
    expect(host.getAttribute('aria-disabled')).toBe('true');
  });

  it('marks a dora with a shape as well as a colour', () => {
    const host = render({ tile: '1m', marker: true });
    expect(host.querySelector('.marker')).not.toBeNull();
  });

  it('only tints by suit when the setting asks for it', () => {
    let host = render({ tile: '3s' });
    expect(host.classList.contains('suit-colour')).toBe(false);

    settings.set('suitColour', true);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    expect(host.classList.contains('suit-colour')).toBe(true);
    expect(host.getAttribute('data-suit')).toBe('s');
  });

  it('lets a parent add its own classes', () => {
    // The pond marks a riichi discard and the hand marks the drawn tile with `[class.x]` bindings
    // on this element. A host `[class]` string binding would silently drop both.
    const host = render({ tile: '1m' });
    host.classList.add('riichi');
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();

    expect(host.classList.contains('riichi')).toBe(true);
    expect(host.classList.contains('selected')).toBe(true);
  });
});
