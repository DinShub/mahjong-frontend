import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import type { ClientAction } from '@contracts/actions';
import type { TileStr } from '@contracts/tiles';
import type { Prompt } from '@contracts/views';

import { TileComponent } from '@shared/tiles/tile.component';

import { actionSlots, variantLabel, variantTiles } from './action-slots';
import type { ActionKind, ActionSlot } from './action-slots';

/**
 * The buttons for a decision window.
 *
 * Every slot is always rendered; an unoffered one is an empty cell of the same size. That is the
 * whole point — a call window is five seconds, and a Pon button that moves because Chi was not
 * available this time costs the window (`docs/08-graphics-ux.md` §2).
 *
 * A call with more than one form — chi from either side of a run, pon with or without the red five
 * — opens a chooser rather than guessing. Guessing is how a player loses their red five to a
 * client that picked for them.
 */
@Component({
  selector: 'mj-action-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TileComponent],
  host: { class: 'mj-action-bar', '[attr.data-testid]': '"action-bar"' },
  template: `
    @if (expanded(); as kind) {
      <div class="variants" role="group" aria-label="choose which tiles" data-testid="variants">
        @for (option of variantsOf(kind); track $index) {
          <button
            type="button"
            class="variant"
            [attr.data-testid]="'variant-' + $index"
            [attr.aria-label]="variantLabel(option)"
            (click)="pick(option)"
          >
            @for (tile of variantTiles(option); track $index) {
              <mj-tile [tile]="asTile(tile)" size="tiny" />
            }
            <span class="variant-text">{{ variantLabel(option) }}</span>
          </button>
        }
        <button type="button" class="variant cancel" (click)="expanded.set(null)">Back</button>
      </div>
    }

    <div class="slots" role="group" aria-label="available actions">
      @for (slot of slots(); track slot.kind) {
        @if (slot.options.length > 0 || (slot.kind === 'riichi' && riichiMode())) {
          <button
            type="button"
            class="action"
            [class]="'kind-' + slot.kind"
            [class.armed]="slot.kind === 'riichi' && riichiMode()"
            [attr.data-testid]="'action-' + slot.kind"
            [attr.aria-pressed]="slot.kind === 'riichi' ? riichiMode() : null"
            (click)="activate(slot)"
          >
            {{ slot.label }}
            @if (slot.options.length > 1 && slot.kind !== 'riichi') {
              <span class="count" aria-hidden="true">{{ slot.options.length }}</span>
            }
          </button>
        } @else {
          <span class="action empty" aria-hidden="true"></span>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 8px;
      justify-items: end;
      align-content: end;
      width: 100%;
      height: 100%;
    }

    .slots {
      display: grid;
      /* Eight fixed columns. The empty cells are what keeps the offered ones from moving. */
      grid-template-columns: repeat(8, 58px);
      gap: 6px;
    }

    .action {
      font: inherit;
      font-weight: 700;
      font-size: 14px;
      height: 52px;
      padding: 0;
      border-radius: 8px;
      border: 1px solid var(--mj-line);
      background: var(--mj-surface-raised);
      color: var(--mj-text);
      cursor: pointer;
      position: relative;
    }

    .action:hover:not(.empty) {
      background: color-mix(in srgb, var(--mj-accent) 22%, var(--mj-surface-raised));
    }

    .action.empty {
      border-color: transparent;
      background: none;
      cursor: default;
      pointer-events: none;
    }

    .kind-ron,
    .kind-tsumo {
      background: var(--mj-accent);
      color: var(--mj-accent-ink);
      border-color: var(--mj-accent);
    }

    .kind-riichi.armed {
      background: var(--mj-riichi-accent);
      color: #21160c;
      border-color: var(--mj-riichi-accent);
    }

    .kind-pass {
      color: var(--mj-text-muted);
    }

    .count {
      position: absolute;
      inset-block-start: 3px;
      inset-inline-end: 5px;
      font-size: 10px;
      opacity: 0.75;
    }

    .variants {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
      padding: 6px;
      border-radius: 8px;
      background: var(--mj-felt-edge);
      border: 1px solid var(--mj-line);
    }

    .variant {
      display: flex;
      align-items: center;
      gap: 4px;
      font: inherit;
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid var(--mj-line);
      background: var(--mj-surface-raised);
      color: var(--mj-text);
      cursor: pointer;
    }

    .variant-text {
      /* The tiles carry the meaning; the text is for screen readers and narrow layouts. */
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    .variant.cancel {
      color: var(--mj-text-muted);
    }
  `,
})
export class ActionBarComponent {
  readonly prompt = input<Prompt | null>(null);
  readonly riichiMode = input(false);

  readonly choose = output<ClientAction>();
  readonly toggleRiichiMode = output<boolean>();

  protected readonly expanded = signal<ActionKind | null>(null);
  protected readonly variantLabel = variantLabel;
  protected readonly variantTiles = variantTiles;

  protected readonly slots = computed<ActionSlot[]>(() => actionSlots(this.prompt()));

  protected variantsOf(kind: ActionKind): ClientAction[] {
    return this.slots().find((slot) => slot.kind === kind)?.options ?? [];
  }

  protected asTile(tile: string): TileStr {
    return tile as TileStr;
  }

  protected activate(slot: ActionSlot): void {
    if (slot.kind === 'riichi') {
      this.expanded.set(null);
      this.toggleRiichiMode.emit(!this.riichiMode());
      return;
    }
    if (slot.options.length === 1) {
      this.pick(slot.options[0]!);
      return;
    }
    this.expanded.set(this.expanded() === slot.kind ? null : slot.kind);
  }

  protected pick(action: ClientAction): void {
    this.expanded.set(null);
    this.choose.emit(action);
  }
}
