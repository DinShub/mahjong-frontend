import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { Seat } from '@contracts/actions';
import type { TileStr } from '@contracts/tiles';
import type { PlayerView, PlayerViewSeat } from '@contracts/views';

import { CENTRE_BOX, boxStyle, pondBox, seatZoneBox } from './board-layout';
import { CentrePanelComponent } from './centre-panel.component';
import type { HandTile } from './hand.component';
import { PondComponent } from './pond.component';
import { SeatZoneComponent } from './seat-zone.component';
import { doraKinds } from '../state/dora';
import { SEAT_POSITIONS, posName, seatToPos } from '../state/seat-position';
import type { SeatPos } from '../state/seat-position';

interface PlacedSeat {
  pos: SeatPos;
  name: string;
  seat: PlayerViewSeat;
  isSelf: boolean;
  zoneStyle: Record<string, string>;
  pondStyle: Record<string, string>;
}

/**
 * The 16:9 board.
 *
 * Four seat zones on the edges, four ponds ringing the centre, the centre panel, the dora strip.
 * Everything is placed from {@link seatZoneBox} / {@link pondBox} in stage units and rotated as a
 * whole, which is what lets every child be written for the bottom orientation only.
 *
 * The board is presentational: it takes a `PlayerView` and reports what was touched. The store,
 * the prompt and the socket are the game component's business.
 */
@Component({
  selector: 'mj-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CentrePanelComponent, PondComponent, SeatZoneComponent],
  host: { class: 'mj-board', '[attr.data-testid]': '"board"' },
  template: `
    @for (placed of seats(); track placed.seat.seat) {
      <div class="slot pond-slot" [style]="placed.pondStyle" [attr.data-pos]="placed.pos">
        <mj-pond [discards]="placed.seat.discards" [testId]="'pond-' + placed.name" />
      </div>
    }

    <div class="slot" [style]="centreStyle">
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
    </div>

    @for (placed of seats(); track placed.seat.seat) {
      <div class="slot zone-slot" [style]="placed.zoneStyle" [attr.data-pos]="placed.pos">
        <mj-seat-zone
          [seat]="placed.seat"
          [dealer]="view().dealer"
          [isSelf]="placed.isSelf"
          [active]="view().turn === placed.seat.seat"
          [interactive]="placed.isSelf && interactive()"
          [selectable]="placed.isSelf ? selectableTiles() : null"
          [selectedSlot]="placed.isSelf ? selectedSlot() : null"
          [doraKinds]="dora()"
          [progress]="view().turn === placed.seat.seat ? deadlineProgress() : null"
          [testId]="'seat-' + placed.name"
          (pick)="pick.emit($event)"
          (dragDiscard)="dragDiscard.emit($event)"
        />
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
      background:
        radial-gradient(circle at 50% 42%, var(--mj-surface) 0%, var(--mj-felt) 58%), var(--mj-felt);
      overflow: hidden;
    }

    .slot {
      position: absolute;
      display: grid;
      place-items: center;
    }

    .pond-slot {
      place-items: start center;
    }
  `,
})
export class BoardComponent {
  readonly view = input.required<PlayerView>();
  readonly interactive = input(false);
  readonly selectableTiles = input<readonly TileStr[] | null>(null);
  readonly selectedSlot = input<number | null>(null);
  readonly deadlineProgress = input<number | null>(null);
  readonly uraIndicators = input<readonly TileStr[]>([]);
  /** Per absolute seat, while a score change is being shown. */
  readonly scoreDeltas = input<readonly (number | null)[]>([]);

  readonly pick = output<HandTile>();
  readonly dragDiscard = output<HandTile>();

  protected readonly centreStyle = boxStyle(CENTRE_BOX);

  protected readonly dora = computed(() => doraKinds(this.view().doraIndicators));

  protected readonly playerNames = computed(() =>
    this.view().players.map((seat) => seat.player.displayName),
  );

  protected readonly riichiSeats = computed<Seat[]>(() =>
    this.view()
      .players.filter((seat) => seat.riichi !== null)
      .map((seat) => seat.seat),
  );

  protected readonly seats = computed<PlacedSeat[]>(() => {
    const view = this.view();
    const mine = view.mySeat;
    return SEAT_POSITIONS.map((pos) => {
      const seat = view.players[(pos + (mine ?? 0)) % 4]!;
      return {
        pos,
        name: posName(pos),
        seat,
        isSelf: mine !== null && seat.seat === mine,
        zoneStyle: boxStyle(seatZoneBox(seatToPos(seat.seat, mine))),
        pondStyle: boxStyle(pondBox(seatToPos(seat.seat, mine))),
      };
    });
  });
}
