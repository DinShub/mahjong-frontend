import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { DiscardWire } from '@contracts/actions';

import { AnimateInDirective } from '@shared/motion/animate-in.directive';
import { TileComponent } from '@shared/tiles/tile.component';

/** 6 columns, then a new row. Overflow past 4 rows keeps extending the last row. */
export const POND_COLUMNS = 6;
export const POND_ROWS = 4;

export interface PondSlot {
  discard: DiscardWire;
  index: number;
  /** Removed from the pond by a call: the slot stays, empty. */
  called: boolean;
}

/**
 * A discard pond.
 *
 * Two rules that look like details and are not:
 *
 * **A called tile leaves a gap.** Greying it in place is wrong and so is closing the gap: pond
 * *position* is information — how many discards ago something was thrown, and by whom, is how
 * every player in the game reads danger. Removing the tile and reflowing the rest would silently
 * rewrite that history (`docs/08-graphics-ux.md` §2). So the slot survives, empty.
 *
 * **A riichi discard is rotated in place and widens its row.** It marks the turn the declaration
 * happened on, which is what everyone counts back from when working out what is safe.
 */
@Component({
  selector: 'mj-pond',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnimateInDirective, TileComponent],
  host: { class: 'mj-pond', '[attr.data-testid]': 'testId()' },
  template: `
    @for (row of rows(); track $index) {
      <div class="row" [attr.data-row]="$index">
        @for (slot of row; track slot.index) {
          @if (slot.called) {
            <span
              class="gap"
              [class.rotated]="slot.discard.riichiDeclaration"
              [attr.data-testid]="testId() + '-gap-' + slot.index"
              [attr.aria-label]="'called tile, position ' + (slot.index + 1)"
            ></span>
          } @else {
            <mj-tile
              [tile]="slot.discard.tile"
              size="pond"
              [rotated]="slot.discard.riichiDeclaration"
              [class.riichi]="slot.discard.riichiDeclaration"
              [class.tsumogiri]="slot.discard.tsumogiri"
              [testId]="testId() + '-tile-' + slot.index"
              [mjAnimateIn]="motionFor(slot)"
              [mjAnimateWhen]="slot.index === newestIndex()"
            />
          }
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 2px;
      align-content: start;
      justify-content: start;
      width: max-content;
    }

    .row {
      display: flex;
      gap: 2px;
      align-items: flex-start;
      height: 41px;
    }

    /* A rotated tile is 41 wide and 30 tall; the row keeps its height and gains width. */
    mj-tile.riichi {
      margin: calc((41px - 30px) / 2) calc((41px - 30px) / 2);
    }

    /* Tsumogiri is a real signal players read — a dot, not a colour. */
    mj-tile.tsumogiri::after {
      content: '';
      position: absolute;
      inset-block-end: 3px;
      inset-inline-start: 50%;
      translate: -50% 0;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--mj-tile-ink);
      opacity: 0.45;
    }

    .gap {
      display: block;
      width: 30px;
      height: 41px;
      border-radius: 3px;
      border: 1px dashed color-mix(in srgb, var(--mj-line) 60%, transparent);
      opacity: 0.35;
    }

    .gap.rotated {
      width: 41px;
      height: 30px;
      margin: 5.5px;
    }
  `,
})
export class PondComponent {
  readonly discards = input.required<readonly DiscardWire[]>();
  readonly testId = input('pond');
  /** Portrait shrinks ponds to two rows with a tap to expand (`docs/08-graphics-ux.md` §2). */
  readonly maxRows = input(POND_ROWS);

  /** Only the discard that just landed animates; everything else is already on the table. */
  protected readonly newestIndex = computed(() => this.discards().length - 1);

  protected motionFor(slot: PondSlot): 'riichi' | 'tsumogiri' | 'discard' {
    if (slot.discard.riichiDeclaration) return 'riichi';
    return slot.discard.tsumogiri ? 'tsumogiri' : 'discard';
  }

  protected readonly rows = computed<PondSlot[][]>(() => {
    const slots: PondSlot[] = this.discards().map((discard, index) => ({
      discard,
      index,
      called: discard.calledBy !== null,
    }));

    const limit = Math.max(1, this.maxRows());
    const rows: PondSlot[][] = [];
    for (let index = 0; index < slots.length; index += POND_COLUMNS) {
      // The last row absorbs everything past its capacity rather than starting another: a pond
      // that long only happens in a hand full of calls, and an extra row collides with the centre.
      const isLast = rows.length === limit - 1;
      rows.push(isLast ? slots.slice(index) : slots.slice(index, index + POND_COLUMNS));
      if (isLast) break;
    }
    return rows;
  });
}
