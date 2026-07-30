import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { MAX_DORA_INDICATORS } from '@contracts/tiles';
import type { TileStr } from '@contracts/tiles';

import { AnimateInDirective } from '@shared/motion/animate-in.directive';
import { TileComponent } from '@shared/tiles/tile.component';

/**
 * The dora indicators, in the middle of the table, always visible.
 *
 * Five slots always: the unrevealed ones are drawn face-down, because "how many kan have happened"
 * is public information and an indicator strip that grows would hide it behind a layout change.
 * Ura indicators appear in the same strip after a riichi win, below the ones they belong to.
 *
 * `docs/08-graphics-ux.md` §5 says bottom right; it is rendered inside the centre panel instead.
 * The corner put the one tile that changes what every hand at the table is worth as far from the
 * board as it is possible to put it.
 */
@Component({
  selector: 'mj-dora-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnimateInDirective, TileComponent],
  host: { class: 'mj-dora', '[attr.data-testid]': '"dora-strip"' },
  template: `
    <div class="row" role="group" aria-label="dora indicators">
      @for (slot of slots(); track $index) {
        <mj-tile
          [tile]="slot"
          size="pond"
          [testId]="'dora-' + $index"
          [ariaLabel]="slot === null ? 'unrevealed dora indicator' : null"
          mjAnimateIn="dora"
          [mjAnimateWhen]="$index === newestIndex()"
        />
      }
    </div>
    @if (ura().length > 0) {
      <div class="row ura" role="group" aria-label="ura dora indicators" data-testid="ura-row">
        @for (slot of ura(); track $index) {
          <mj-tile [tile]="slot" size="pond" [testId]="'ura-' + $index" />
        }
      </div>
    }
  `,
  styles: `
    /* No chrome of its own: it sits inside the centre panel, which already is a panel. */
    :host {
      display: grid;
      gap: 3px;
      justify-items: center;
    }

    .row {
      display: flex;
      gap: 2px;
    }

    .ura {
      opacity: 0.95;
    }

    .ura::before {
      content: 'ura';
      align-self: center;
      margin-inline-end: 4px;
      font-size: 11px;
      color: var(--mj-text-muted);
    }
  `,
})
export class DoraStripComponent {
  readonly indicators = input.required<readonly TileStr[]>();
  readonly ura = input<readonly TileStr[]>([]);

  /** The indicator a kan just turned over — the only one that should flip. */
  protected readonly newestIndex = computed(() => this.indicators().length - 1);

  protected readonly slots = computed<(TileStr | null)[]>(() => {
    const revealed = this.indicators();
    return Array.from({ length: MAX_DORA_INDICATORS }, (_unused, index) => revealed[index] ?? null);
  });
}
