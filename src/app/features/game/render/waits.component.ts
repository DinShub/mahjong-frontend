import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { TileStr } from '@contracts/tiles';
import type { WaitView } from '@contracts/views';

import { TileComponent } from '@shared/tiles/tile.component';

interface WaitTile {
  tile: TileStr;
  /** In the player's own pond — the reason the hand is furiten. Greyed. */
  discarded: boolean;
}

/**
 * What your hand is waiting on.
 *
 * The tiles come from the server (`PlayerView.myWaits`, pushed by `game:waits`); nothing here
 * decides anything, which is the same rule the board follows.
 *
 * **Furiten is shown twice, on purpose.** The tiles the player has already discarded are greyed,
 * because "why am I furiten" is answered by pointing at them — but furiten blocks ron on *every*
 * wait, not only those, so the strip as a whole is also marked. Greying alone would say the
 * un-greyed tiles are still winnable by ron, which is exactly the mistake that costs a hand: a
 * player sees one grey tile among three, waits for either of the other two, and calls a ron the
 * server refuses. Temporary and riichi furiten have no greyed tile at all and still block, which is
 * the case that makes the second signal load-bearing rather than decorative.
 */
@Component({
  selector: 'mj-waits',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TileComponent],
  host: {
    class: 'mj-waits',
    '[class.furiten]': 'waits().furiten',
    '[attr.data-testid]': 'testId()',
  },
  template: `
    <span class="label" [attr.data-testid]="testId() + '-label'">
      @if (waits().furiten) {
        <ng-container i18n="@@waits.furiten">Furiten — no ron</ng-container>
      } @else {
        <ng-container i18n="@@waits.waiting">Waiting on</ng-container>
      }
    </span>

    <span class="tiles">
      @for (entry of tiles(); track entry.tile) {
        <mj-tile
          [tile]="entry.tile"
          size="meld"
          [dimmed]="entry.discarded"
          [ariaLabel]="label(entry)"
          [testId]="testId() + '-' + entry.tile"
        />
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--mj-surface) 88%, transparent);
      border: 1px solid var(--mj-line);
    }

    :host(.furiten) {
      border-color: var(--mj-danger);
    }

    .label {
      font-size: 11px;
      letter-spacing: 0.02em;
      color: var(--mj-text-muted);
      white-space: nowrap;
    }

    :host(.furiten) .label {
      color: var(--mj-danger);
    }

    .tiles {
      display: flex;
      gap: 2px;
    }

    /*
      mj-tile already drops a dimmed tile to 0.55 opacity. Desaturating as well is what makes the
      difference readable at meld size, where a 45% opacity change on a small tile is easy to miss —
      and colour is never the only carrier here either, since the label says "furiten" in words.
    */
    mj-tile.dimmed {
      filter: grayscale(1);
    }
  `,
})
export class WaitsComponent {
  readonly waits = input.required<WaitView>();
  readonly testId = input('waits');

  protected readonly tiles = computed<WaitTile[]>(() => {
    const waits = this.waits();
    const discarded = new Set(waits.inMyDiscards);
    return waits.tiles.map((tile) => ({ tile, discarded: discarded.has(tile) }));
  });

  protected label(entry: WaitTile): string {
    return entry.discarded ? `${entry.tile}, in your discards` : entry.tile;
  }
}
