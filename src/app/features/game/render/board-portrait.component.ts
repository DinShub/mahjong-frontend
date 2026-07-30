import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import type { Seat } from '@contracts/actions';
import type { TileStr } from '@contracts/tiles';
import type { PlayerView, PlayerViewSeat } from '@contracts/views';

import { CentrePanelComponent } from './centre-panel.component';
import { HandComponent } from './hand.component';
import type { HandTile } from './hand.component';
import { MeldsComponent } from './melds.component';
import { NameplateComponent } from './nameplate.component';
import { PondComponent } from './pond.component';
import { doraKinds } from '../state/dora';
import {
  POS_LEFT,
  POS_RIGHT,
  POS_TOP,
  posName,
  seatToPos,
  seatWindOf,
} from '../state/seat-position';
import type { SeatPos } from '../state/seat-position';

interface OpponentCard {
  pos: SeatPos;
  name: string;
  seat: PlayerViewSeat;
}

/**
 * The portrait board.
 *
 * A separate layout module, not a media query on the landscape one (`docs/08-graphics-ux.md` §2).
 * Narrowing the desktop board does not work: four ponds around a centre panel stop being *readable*
 * long before they stop fitting, and tile backs at phone width are a row of grey rectangles that
 * tell you nothing a number would not.
 *
 * So: opponents become a strip of cards with a hand-count badge, ponds get two rows and a tap to
 * expand, and everything the thumb has to hit is at the bottom at full size.
 */
@Component({
  selector: 'mj-board-portrait',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CentrePanelComponent, HandComponent, MeldsComponent, NameplateComponent, PondComponent],
  host: { class: 'mj-board-portrait', '[attr.data-testid]': '"board-portrait"' },
  template: `
    <header class="opponents">
      @for (card of opponents(); track card.seat.seat) {
        <div
          class="card"
          [class.turn]="view().turn === card.seat.seat"
          [attr.data-testid]="'opponent-' + card.name"
        >
          <mj-nameplate
            [player]="card.seat.player"
            [wind]="windOf(card.seat.seat)"
            [connection]="card.seat.connection"
            [active]="view().turn === card.seat.seat"
            [riichi]="card.seat.riichi !== null"
            [progress]="view().turn === card.seat.seat ? deadlineProgress() : null"
            [testId]="'portrait-nameplate-' + card.name"
          />
          <div class="badges">
            <span class="badge" [attr.data-testid]="'hand-count-' + card.name">
              {{ card.seat.handSize }}<span class="unit" aria-hidden="true">牌</span>
              <span class="sr-only">tiles in hand</span>
            </span>
            <span class="badge score">{{ view().scores[card.seat.seat] }}</span>
          </div>
          <mj-melds
            [melds]="card.seat.melds"
            [owner]="card.seat.seat"
            size="opponent"
            [testId]="'portrait-melds-' + card.name"
          />
        </div>
      }
    </header>

    <section class="middle">
      <mj-centre-panel
        [round]="view().round"
        [kyoku]="view().kyoku"
        [honba]="view().honba"
        [riichiSticks]="view().riichiSticks"
        [wallRemaining]="view().wallRemaining"
        [dealer]="view().dealer"
        [turn]="view().turn"
        [scores]="view().scores"
        [names]="playerNames()"
        [riichiSeats]="riichiSeats()"
        [deltas]="scoreDeltas()"
        [mySeat]="view().mySeat"
        [doraIndicators]="view().doraIndicators"
        [ura]="uraIndicators()"
      />
    </section>

    <section class="ponds">
      <button
        type="button"
        class="expand"
        [attr.aria-expanded]="pondsExpanded()"
        data-testid="expand-ponds"
        (click)="pondsExpanded.set(!pondsExpanded())"
      >
        {{ pondsExpanded() ? 'Collapse discards' : 'Expand discards' }}
      </button>
      <div class="pond-grid" [class.expanded]="pondsExpanded()">
        @for (card of allSeats(); track card.seat.seat) {
          <div class="pond-cell" [attr.data-testid]="'portrait-pond-cell-' + card.name">
            <span class="pond-owner">{{ card.seat.player.displayName }}</span>
            <mj-pond
              [discards]="card.seat.discards"
              [maxRows]="pondsExpanded() ? 4 : 2"
              [testId]="'portrait-pond-' + card.name"
            />
          </div>
        }
      </div>
    </section>

    <footer class="self">
      <div class="self-top">
        @if (me(); as mine) {
          <mj-melds
            [melds]="mine.melds"
            [owner]="mine.seat"
            size="meld"
            testId="portrait-my-melds"
          />
        }
      </div>
      @if (me(); as mine) {
        <mj-hand
          [hand]="mine.hand"
          [count]="mine.handSize"
          [drawn]="mine.drawn"
          [detached]="mine.handSize % 3 === 2"
          size="hand"
          [interactive]="interactive()"
          [selectable]="selectableTiles()"
          [selectedSlot]="selectedSlot()"
          [doraKinds]="dora()"
          testId="portrait-hand"
          (pick)="pick.emit($event)"
          (dragDiscard)="dragDiscard.emit($event)"
        />
      }
    </footer>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      gap: 12px;
      width: 100%;
      height: 100%;
      padding: 16px;
      background:
        radial-gradient(circle at 50% 30%, var(--mj-surface) 0%, var(--mj-felt) 60%), var(--mj-felt);
    }

    .opponents {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .card {
      display: grid;
      gap: 6px;
      justify-items: start;
      padding: 8px;
      border-radius: 10px;
      border: 1px solid transparent;
      background: color-mix(in srgb, var(--mj-felt-edge) 60%, transparent);
    }

    .card.turn {
      border-color: var(--mj-turn-ring);
    }

    .badges {
      display: flex;
      gap: 6px;
    }

    .badge {
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--mj-surface-raised);
      font-size: 15px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .badge .unit {
      font-size: 11px;
      opacity: 0.7;
      margin-inline-start: 2px;
    }

    .badge.score {
      font-weight: 500;
      color: var(--mj-text-muted);
    }

    .middle {
      display: grid;
      place-items: center;
    }

    .ponds {
      display: grid;
      gap: 8px;
      align-content: start;
    }

    .expand {
      justify-self: end;
      font: inherit;
      font-size: 13px;
      /* 44 px is the minimum touch target for the portrait layout. */
      min-height: 44px;
      padding: 0 16px;
      border-radius: 8px;
      border: 1px solid var(--mj-line);
      background: var(--mj-surface-raised);
      color: var(--mj-text);
    }

    .pond-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .pond-cell {
      display: grid;
      gap: 3px;
      justify-items: start;
    }

    .pond-owner {
      font-size: 11px;
      color: var(--mj-text-muted);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .self {
      display: grid;
      gap: 8px;
    }

    .self-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 10px;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class BoardPortraitComponent {
  readonly view = input.required<PlayerView>();
  readonly interactive = input(false);
  readonly selectableTiles = input<readonly TileStr[] | null>(null);
  readonly selectedSlot = input<number | null>(null);
  readonly deadlineProgress = input<number | null>(null);
  readonly uraIndicators = input<readonly TileStr[]>([]);
  readonly scoreDeltas = input<readonly (number | null)[]>([]);

  readonly pick = output<HandTile>();
  readonly dragDiscard = output<HandTile>();

  protected readonly pondsExpanded = signal(false);

  protected readonly dora = computed(() => doraKinds(this.view().doraIndicators));

  protected readonly me = computed<PlayerViewSeat | null>(() => {
    const view = this.view();
    if (view.mySeat === null) return null;
    return view.players.find((seat) => seat.seat === view.mySeat) ?? null;
  });

  protected readonly playerNames = computed(() =>
    this.view().players.map((seat) => seat.player.displayName),
  );

  protected readonly riichiSeats = computed<Seat[]>(() =>
    this.view()
      .players.filter((seat) => seat.riichi !== null)
      .map((seat) => seat.seat),
  );

  protected readonly allSeats = computed<OpponentCard[]>(() => {
    const view = this.view();
    return view.players.map((seat) => {
      const pos = seatToPos(seat.seat, view.mySeat);
      return { pos, name: posName(pos), seat };
    });
  });

  /** Left, across, right — in the order they sit, so the strip matches the table. */
  protected readonly opponents = computed<OpponentCard[]>(() => {
    const order = [POS_LEFT, POS_TOP, POS_RIGHT];
    const placed = this.allSeats();
    return order
      .map((pos) => placed.find((card) => card.pos === pos))
      .filter((card): card is OpponentCard => card !== undefined);
  });

  protected windOf(seat: Seat): ReturnType<typeof seatWindOf> {
    return seatWindOf(seat, this.view().dealer);
  }
}
