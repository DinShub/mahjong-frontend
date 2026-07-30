import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { compareTileStr } from '@contracts/tiles';
import type { TileKind, TileStr } from '@contracts/tiles';

import { SettingsService } from '@core/settings/settings.service';

import { AnimateInDirective } from '@shared/motion/animate-in.directive';

import { TileComponent } from '@shared/tiles/tile.component';
import type { TileSize } from '@shared/tiles/tile.component';

import { isDora } from '../state/dora';

/** How far up a tile has to be dragged before it counts as a discard, in CSS pixels. */
const DRAG_DISCARD_THRESHOLD = 34;

export interface HandTile {
  tile: TileStr | null;
  /** Position in the rendered hand; `0` is the drawn tile, matching the keyboard binding. */
  slot: number;
  drawn: boolean;
  selectable: boolean;
  dora: boolean;
  key: string;
}

/**
 * A hand — the player's own, face up and sorted, or an opponent's, as backs.
 *
 * The drawn tile is rendered detached at the right (`docs/08-graphics-ux.md` §2). That is not
 * decoration: the difference between a tedashi and a tsumogiri is the single most-read piece of
 * information at the table, and a client that merged the drawn tile into the hand would make its
 * own tsumogiri indistinguishable while still showing everyone else's.
 *
 * Selection *policy* — one click or two, what riichi mode allows — belongs to the input layer. This
 * component reports what was touched and renders what it is told.
 */
@Component({
  selector: 'mj-hand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnimateInDirective, TileComponent],
  host: { class: 'mj-hand', '[attr.data-testid]': 'testId()' },
  template: `
    <div class="tiles" role="group" [attr.aria-label]="groupLabel()">
      @for (entry of tiles(); track entry.key) {
        <mj-tile
          [tile]="entry.tile"
          [size]="size()"
          [interactive]="interactive() && entry.selectable"
          [disabled]="interactive() && !entry.selectable"
          [selected]="entry.slot === selectedSlot()"
          [marker]="entry.dora && showDora()"
          [testId]="testId() + '-' + entry.slot"
          [class.drawn]="entry.drawn"
          mjAnimateIn="draw"
          [mjAnimateWhen]="entry.drawn"
          (click)="pick.emit(entry)"
          (keydown.enter)="pick.emit(entry)"
          (keydown.space)="pick.emit(entry); $event.preventDefault()"
          (pointerdown)="onPointerDown($event, entry)"
        />
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      touch-action: none;
    }

    .tiles {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      padding-block-start: 12px;
    }

    /* The detached drawn tile: a real gap, wide enough to be unmistakable at a glance. */
    mj-tile.drawn {
      margin-inline-start: 22px;
    }
  `,
})
export class HandComponent {
  private readonly settings = inject(SettingsService);

  /** `null` renders `count` backs — an opponent, or your own hand before it is dealt. */
  readonly hand = input<readonly TileStr[] | null>(null);
  readonly count = input(13);
  readonly drawn = input<TileStr | null>(null);
  readonly size = input<TileSize>('hand');
  readonly interactive = input(false);
  /**
   * Whether the last tile is drawn — and so detached. For your own hand this follows `drawn`; for
   * an opponent it is `handSize % 3 === 2`, which is true exactly when a seat is mid-turn holding
   * a tile it has not discarded yet, melds or no melds.
   */
  readonly detached = input(false);
  /** `null` means every tile is selectable; a list restricts it (riichi mode does exactly this). */
  readonly selectable = input<readonly TileStr[] | null>(null);
  readonly selectedSlot = input<number | null>(null);
  readonly doraKinds = input<ReadonlySet<TileKind>>(new Set<TileKind>());
  readonly showDora = input(true);
  readonly testId = input('hand');
  readonly label = input<string | null>(null);

  readonly pick = output<HandTile>();
  readonly dragDiscard = output<HandTile>();

  protected readonly groupLabel = computed(() => {
    const explicit = this.label();
    if (explicit !== null) return explicit;
    const hand = this.hand();
    return hand === null ? `${String(this.count())} tiles, face down` : 'your hand';
  });

  protected readonly tiles = computed<HandTile[]>(() => {
    const hand = this.hand();
    const drawn = this.drawn();
    const selectable = this.selectable();
    const kinds = this.doraKinds();
    const allowed = selectable === null ? null : new Set(selectable);

    const detached = drawn !== null || this.detached();
    const concealed =
      hand === null
        ? Array.from({ length: Math.max(0, this.count() - (detached ? 1 : 0)) }, () => null)
        : this.settings.autoSortHand()
          ? [...hand].sort(compareTileStr)
          : [...hand];

    // Slot 1..n for the hand, slot 0 for the drawn tile: the keyboard bindings are `1`-`9` and `0`.
    const entries: HandTile[] = concealed.map((tile, index) => ({
      tile,
      slot: index + 1,
      drawn: false,
      selectable: tile === null ? false : (allowed?.has(tile) ?? true),
      dora: tile !== null && isDora(tile, kinds),
      key: `${String(index)}:${tile ?? 'back'}`,
    }));

    if (detached) {
      entries.push({
        tile: drawn,
        slot: 0,
        drawn: true,
        selectable: drawn === null ? false : (allowed?.has(drawn) ?? true),
        dora: drawn !== null && isDora(drawn, kinds),
        key: `drawn:${drawn ?? 'back'}`,
      });
    }
    return entries;
  });

  /**
   * Drag up to discard. Pointer events rather than a drag-and-drop API: this has to work with a
   * thumb, and HTML5 drag-and-drop does not fire on touch at all.
   */
  protected onPointerDown(event: PointerEvent, entry: HandTile): void {
    if (!this.interactive() || !entry.selectable) return;
    const startY = event.clientY;
    const target = event.target as HTMLElement | null;

    const move = (moveEvent: PointerEvent): void => {
      if (startY - moveEvent.clientY < DRAG_DISCARD_THRESHOLD) return;
      cleanup();
      this.dragDiscard.emit(entry);
    };
    const cleanup = (): void => {
      target?.releasePointerCapture?.(event.pointerId);
      globalThis.removeEventListener('pointermove', move);
      globalThis.removeEventListener('pointerup', cleanup);
      globalThis.removeEventListener('pointercancel', cleanup);
    };

    globalThis.addEventListener('pointermove', move);
    globalThis.addEventListener('pointerup', cleanup);
    globalThis.addEventListener('pointercancel', cleanup);
  }
}
