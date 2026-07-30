import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { MeldWire, Seat } from '@contracts/actions';
import type { TileStr } from '@contracts/tiles';

import { MeldsComponent } from './melds.component';
import { loadAllFixtures } from '../state/fixtures';

const PON_FROM_ACROSS: MeldWire = {
  type: 'pon',
  tiles: ['7p', '7p', '7p'] as TileStr[],
  calledTile: '7p' as TileStr,
  calledIndex: 0,
  from: 2,
};

describe('MeldsComponent', () => {
  let fixture: ComponentFixture<MeldsComponent>;

  function render(melds: MeldWire[], owner: Seat = 0): void {
    fixture.componentRef.setInput('melds', melds);
    fixture.componentRef.setInput('owner', owner);
    fixture.detectChanges();
  }

  /** A readable picture of the meld: `|` marks the rotated column, `^` a stacked one. */
  function shape(): string[] {
    return [...fixture.nativeElement.querySelectorAll('.meld')].map((meld) =>
      [...(meld as HTMLElement).querySelectorAll(':scope > .column')]
        .map((column) => {
          const node = column as HTMLElement;
          const tiles = [...node.querySelectorAll('mj-tile')].map(
            (tile) => (tile as HTMLElement).getAttribute('data-tile') ?? '?',
          );
          const body = tiles.join('+');
          if (node.classList.contains('rotated')) return `|${body}|`;
          return body;
        })
        .join(' '),
    );
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MeldsComponent] });
    fixture = TestBed.createComponent(MeldsComponent);
  });

  it('puts the sideways tile on the side that names the source seat', () => {
    render([{ ...PON_FROM_ACROSS, from: 3 }]);
    expect(shape()).toEqual(['|7p| 7p 7p']);

    render([{ ...PON_FROM_ACROSS, from: 2 }]);
    expect(shape()).toEqual(['7p |7p| 7p']);

    render([{ ...PON_FROM_ACROSS, from: 1 }]);
    expect(shape()).toEqual(['7p 7p |7p|']);
  });

  it('shows a concealed kan as two backs around two faces', () => {
    render([
      {
        type: 'ankan',
        tiles: ['1z', '1z', '1z', '1z'] as TileStr[],
        calledTile: null,
        calledIndex: null,
        from: null,
      },
    ]);
    expect(shape()).toEqual(['back 1z 1z back']);
  });

  it('stacks the added tile of a shouminkan on the rotated one', () => {
    render([
      {
        type: 'shouminkan',
        tiles: ['3s', '3s', '3s', '3s'] as TileStr[],
        calledTile: '3s' as TileStr,
        calledIndex: 0,
        from: 1,
      },
    ]);
    expect(shape()).toEqual(['3s 3s |3s+3s|']);
  });

  it('lays melds out in the order they were called', () => {
    render([
      { ...PON_FROM_ACROSS, from: 3 },
      {
        ...PON_FROM_ACROSS,
        tiles: ['2s', '3s', '4s'] as TileStr[],
        calledTile: '2s' as TileStr,
        type: 'chi',
        from: 3,
      },
    ]);
    expect(shape()).toEqual(['|7p| 7p 7p', '|2s| 3s 4s']);
  });

  it('labels each set for a screen reader', () => {
    render([PON_FROM_ACROSS]);
    const group = fixture.nativeElement.querySelector('.meld') as HTMLElement;
    expect(group.getAttribute('aria-label')).toBe('pon');
    expect(group.getAttribute('role')).toBe('group');
  });

  it('renders every meld of every recorded game with exactly one rotated tile', () => {
    for (const wire of loadAllFixtures()) {
      for (const seat of wire.final.players) {
        if (seat.melds.length === 0) continue;
        render([...seat.melds], seat.seat);
        const drawn = shape();
        expect(drawn).toHaveLength(seat.melds.length);
        drawn.forEach((picture, index) => {
          const rotated = (picture.match(/\|/g) ?? []).length / 2;
          expect(rotated).toBe(seat.melds[index]?.type === 'ankan' ? 0 : 1);
        });
      }
    }
  });
});
