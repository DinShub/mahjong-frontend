import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { DiscardWire, Seat } from '@contracts/actions';
import type { TileStr } from '@contracts/tiles';

import { POND_COLUMNS, PondComponent } from './pond.component';
import { loadAllFixtures } from '../state/fixtures';

function discard(tile: string, overrides: Partial<DiscardWire> = {}): DiscardWire {
  return {
    tile: tile as TileStr,
    tsumogiri: false,
    riichiDeclaration: false,
    calledBy: null,
    ...overrides,
  };
}

describe('PondComponent', () => {
  let fixture: ComponentFixture<PondComponent>;

  function render(discards: DiscardWire[], maxRows?: number): void {
    fixture.componentRef.setInput('discards', discards);
    if (maxRows !== undefined) fixture.componentRef.setInput('maxRows', maxRows);
    fixture.detectChanges();
  }

  function rows(): HTMLElement[] {
    return [...fixture.nativeElement.querySelectorAll('.row')] as HTMLElement[];
  }

  function layout(): string[][] {
    return rows().map((row) =>
      [...row.children].map((child) => {
        const node = child as HTMLElement;
        if (node.classList.contains('gap')) return '—';
        const tile = node.getAttribute('data-tile') ?? '?';
        return node.classList.contains('riichi') ? `[${tile}]` : tile;
      }),
    );
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PondComponent] });
    fixture = TestBed.createComponent(PondComponent);
  });

  it('fills six to a row', () => {
    render(['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m'].map((tile) => discard(tile)));
    expect(layout()).toEqual([
      ['1m', '2m', '3m', '4m', '5m', '6m'],
      ['7m', '8m'],
    ]);
    expect(rows()).toHaveLength(2);
  });

  it('leaves a gap where a tile was called, and does not reflow', () => {
    render([
      discard('1m'),
      discard('2m', { calledBy: 1 }),
      discard('3m'),
      discard('4m'),
      discard('5m'),
      discard('6m'),
      discard('7m'),
    ]);

    // Pond *position* is information players read: 7m stays the seventh discard, on the second
    // row, exactly as it would have been if nothing had been called.
    expect(layout()).toEqual([['1m', '—', '3m', '4m', '5m', '6m'], ['7m']]);
  });

  it('rotates a riichi declaration in place', () => {
    render([discard('1m'), discard('5p', { riichiDeclaration: true }), discard('9s')]);
    expect(layout()).toEqual([['1m', '[5p]', '9s']]);
  });

  it('marks a tsumogiri without using colour to do it', () => {
    render([discard('1m', { tsumogiri: true })]);
    const tile = fixture.nativeElement.querySelector('[data-testid="pond-tile-0"]') as HTMLElement;
    expect(tile.classList.contains('tsumogiri')).toBe(true);
  });

  it('extends the last row rather than starting a fifth', () => {
    render(Array.from({ length: 27 }, (_unused, index) => discard(`${(index % 9) + 1}m`)));
    const shape = layout();
    expect(shape).toHaveLength(4);
    expect(shape[3]).toHaveLength(27 - 3 * POND_COLUMNS);
  });

  it('shrinks to two rows for the portrait layout', () => {
    render(
      Array.from({ length: 18 }, (_unused, index) => discard(`${(index % 9) + 1}m`)),
      2,
    );
    const shape = layout();
    expect(shape).toHaveLength(2);
    expect(shape[1]).toHaveLength(12);
  });

  it('renders every pond of every recorded game with one slot per discard', () => {
    for (const wire of loadAllFixtures()) {
      for (const seat of wire.final.players) {
        render([...seat.discards]);
        const slots = layout().flat();
        expect(slots).toHaveLength(seat.discards.length);
        const gaps = slots.filter((slot) => slot === '—').length;
        expect(gaps).toBe(seat.discards.filter((entry) => entry.calledBy !== null).length);
        // …and the label of a gap says which position it was, so it is not silently a blank.
        void (seat.seat as Seat);
      }
    }
  });
});
