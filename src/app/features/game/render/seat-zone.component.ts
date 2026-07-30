import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { Seat, Wind } from '@contracts/actions';
import type { TileKind, TileStr } from '@contracts/tiles';
import type { PlayerViewSeat } from '@contracts/views';

import { HandComponent } from './hand.component';
import type { HandTile } from './hand.component';
import { MeldsComponent } from './melds.component';
import { NameplateComponent } from './nameplate.component';
import { seatWindOf } from '../state/seat-position';

/**
 * One seat's hand, melds and nameplate — written for the bottom orientation only.
 *
 * Every other seat is this component inside a rotated container (`docs/08-graphics-ux.md` §2), so
 * there is one layout to get right instead of four. The parent supplies the rotation; nothing here
 * knows which way up it is.
 */
@Component({
  selector: 'mj-seat-zone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HandComponent, MeldsComponent, NameplateComponent],
  host: {
    class: 'mj-seat-zone',
    '[class.self]': 'isSelf()',
    '[attr.data-testid]': 'testId()',
    '[attr.data-seat]': 'seat().seat',
  },
  template: `
    <mj-nameplate
      [player]="seat().player"
      [wind]="wind()"
      [connection]="seat().connection"
      [active]="active()"
      [riichi]="seat().riichi !== null"
      [progress]="progress()"
      [testId]="testId() + '-nameplate'"
    />

    <mj-hand
      [hand]="revealedHand()"
      [count]="seat().handSize"
      [drawn]="seat().drawn"
      [detached]="holdsDrawnTile()"
      [size]="isSelf() ? 'hand' : 'opponent'"
      [interactive]="interactive()"
      [selectable]="selectable()"
      [selectedSlot]="selectedSlot()"
      [doraKinds]="doraKinds()"
      [showDora]="isSelf()"
      [label]="handLabel()"
      [testId]="testId() + '-hand'"
      (pick)="pick.emit($event)"
      (dragDiscard)="dragDiscard.emit($event)"
    />

    <mj-melds
      [melds]="seat().melds"
      [owner]="seat().seat"
      [size]="isSelf() ? 'meld' : 'opponent'"
      [testId]="testId() + '-melds'"
    />
  `,
  styles: `
    :host {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 16px;
      width: 100%;
      height: 100%;
      padding: 0 8px;
    }

    mj-nameplate {
      margin-block-end: 6px;
      flex: none;
    }

    mj-hand {
      flex: none;
    }

    mj-melds {
      flex: none;
      margin-block-end: 2px;
    }
  `,
})
export class SeatZoneComponent {
  readonly seat = input.required<PlayerViewSeat>();
  readonly dealer = input.required<Seat>();
  readonly isSelf = input(false);
  readonly active = input(false);
  readonly interactive = input(false);
  readonly selectable = input<readonly TileStr[] | null>(null);
  readonly selectedSlot = input<number | null>(null);
  readonly doraKinds = input<ReadonlySet<TileKind>>(new Set<TileKind>());
  readonly progress = input<number | null>(null);
  readonly testId = input('seat');

  readonly pick = output<HandTile>();
  readonly dragDiscard = output<HandTile>();

  protected readonly wind = computed<Wind>(() => seatWindOf(this.seat().seat, this.dealer()));

  /** Face up for you, and for anyone whose tenpai was revealed at an exhaustive draw. */
  protected readonly revealedHand = computed<readonly TileStr[] | null>(() => {
    const seat = this.seat();
    return this.isSelf() || seat.isTenpaiRevealed ? seat.hand : null;
  });

  /**
   * A seat is holding a drawn tile exactly when its concealed count is 2 mod 3 — 14 with no melds,
   * 11 with one, 8 with two. It is the one thing about an opponent's turn that is public, and it
   * is what makes their next discard readable as tedashi or tsumogiri.
   */
  protected readonly holdsDrawnTile = computed(() => this.seat().handSize % 3 === 2);

  protected readonly handLabel = computed(() => {
    const seat = this.seat();
    if (this.isSelf()) return 'your hand';
    return `${seat.player.displayName}, ${String(seat.handSize)} tiles`;
  });
}
