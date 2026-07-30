import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { MeldWire, Seat } from '@contracts/actions';

import { AnimateInDirective } from '@shared/motion/animate-in.directive';
import { TileComponent } from '@shared/tiles/tile.component';

import { layoutMeld, meldLabel } from './meld-layout';
import type { MeldColumn } from './meld-layout';

interface RenderedMeld {
  columns: MeldColumn[];
  label: string;
  key: string;
}

/**
 * A seat's called sets, laid out to the outside of their hand.
 *
 * All of the thinking is in {@link layoutMeld}; this renders its output. A rotated column is 46
 * wide and 34 tall where an upright one is 34 × 46, and a shouminkan's added tile sits on top of
 * the rotated one — which makes that column two tiles tall and is why melds are laid out as
 * columns rather than a flat list of tiles.
 */
@Component({
  selector: 'mj-melds',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnimateInDirective, TileComponent],
  host: { class: 'mj-melds', '[attr.data-testid]': 'testId()' },
  template: `
    @for (meld of rendered(); track meld.key) {
      <div
        class="meld"
        [attr.aria-label]="meld.label"
        role="group"
        mjAnimateIn="call"
        [mjAnimateWhen]="$last"
      >
        @for (column of meld.columns; track $index) {
          <div
            class="column"
            [class.rotated]="column.rotated"
            [class.stacked]="column.tiles.length > 1"
          >
            @for (tile of column.tiles; track $index) {
              <mj-tile [tile]="tile" [size]="size()" [rotated]="column.rotated" />
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      gap: 10px;
      align-items: flex-end;
    }

    .meld {
      display: flex;
      gap: 1px;
      align-items: flex-end;
    }

    .column {
      display: flex;
      flex-direction: column-reverse;
      align-items: center;
      justify-content: flex-start;
    }

    /* Rotating a 34 × 46 tile inside a 46 × 34 box: the box takes the swapped dimensions and the
       tile's own rotated transform does the turning. */
    .column.rotated {
      width: 46px;
      justify-content: flex-end;
    }

    .column.rotated mj-tile {
      margin: 6px -6px;
    }

    /* The added tile of a shouminkan sits on the rotated one, overlapping by most of its height. */
    .column.stacked mj-tile + mj-tile {
      margin-block-end: -22px;
    }
  `,
})
export class MeldsComponent {
  readonly melds = input.required<readonly MeldWire[]>();
  readonly owner = input.required<Seat>();
  readonly size = input<'meld' | 'pond' | 'opponent'>('meld');
  readonly testId = input('melds');

  protected readonly rendered = computed<RenderedMeld[]>(() =>
    this.melds().map((meld, index) => ({
      columns: layoutMeld(meld, this.owner()),
      label: meldLabel(meld),
      key: `${String(index)}:${meld.type}:${meld.tiles.join('')}`,
    })),
  );
}
