import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { PlayerInfo, RyuukyokuEvent, RyuukyokuReason } from '@contracts/actions';

import { TileComponent } from '@shared/tiles/tile.component';

const REASON_LABEL: Readonly<Record<RyuukyokuReason, string>> = {
  exhaustive: 'Exhaustive draw',
  kyuushu_kyuuhai: 'Nine terminals — hand abandoned',
  suufon_renda: 'Four winds discarded — hand abandoned',
  suucha_riichi: 'Four riichi — hand abandoned',
  suukaikan: 'Four kans — hand abandoned',
  sanchahou: 'Triple ron — hand abandoned',
};

/**
 * A draw.
 *
 * The two things this has to get right are both about *what is revealed*. At an exhaustive draw
 * only the tenpai hands turn face up, and the server has already decided which — the client shows
 * `hands[seat]` where it is not null and a "noten" badge where it is. Nagashi mangan is an
 * exhaustive draw with a completely different payment, and it is rare enough (one hand in a
 * million in M2's soak) that a player seeing it deserves to be told what happened rather than
 * left to work it out from the numbers.
 */
@Component({
  selector: 'mj-ryuukyoku-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TileComponent],
  host: {
    class: 'mj-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-label]': '"draw"',
    '[attr.data-testid]': '"ryuukyoku-overlay"',
  },
  template: `
    <div class="sheet">
      <header>
        <h2 data-testid="ryuukyoku-reason">{{ reasonLabel() }}</h2>
        @if (nagashi().length > 0) {
          <p class="nagashi" data-testid="nagashi">
            Nagashi mangan — {{ nagashiNames() }} scored on their discards alone.
          </p>
        }
      </header>

      <div class="seats">
        @for (seat of seats(); track seat.index) {
          <div
            class="seat"
            [class.tenpai]="seat.tenpai"
            [attr.data-testid]="'draw-seat-' + seat.index"
          >
            <div class="who">
              <span class="name">{{ seat.name }}</span>
              <span class="badge" [class.noten]="!seat.tenpai">{{
                seat.tenpai ? 'tenpai' : 'noten'
              }}</span>
            </div>
            @if (seat.hand !== null) {
              <div class="hand">
                @for (tile of seat.hand; track $index) {
                  <mj-tile [tile]="tile" size="tiny" />
                }
              </div>
            }
            <span class="delta" [class.negative]="seat.delta < 0">
              {{ seat.delta > 0 ? '+' : '' }}{{ seat.delta }}
            </span>
          </div>
        }
      </div>

      <button
        type="button"
        class="dismiss"
        data-testid="dismiss-ryuukyoku"
        (click)="dismiss.emit()"
      >
        Continue
      </button>
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgb(0 0 0 / 55%);
      z-index: 20;
    }

    .sheet {
      display: grid;
      gap: 14px;
      max-width: 760px;
      max-height: 90%;
      overflow: auto;
      padding: 22px 26px;
      border-radius: 14px;
      background: var(--mj-surface);
      border: 1px solid var(--mj-line);
      box-shadow: 0 18px 50px rgb(0 0 0 / 45%);
    }

    h2 {
      margin: 0;
      font-size: 20px;
    }

    .nagashi {
      margin: 6px 0 0;
      color: var(--mj-accent);
      font-size: 14px;
    }

    .seats {
      display: grid;
      gap: 8px;
    }

    .seat {
      display: grid;
      grid-template-columns: 180px 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 6px 10px;
      border-radius: 8px;
      background: var(--mj-felt-edge);
      border: 1px solid transparent;
    }

    .seat.tenpai {
      border-color: var(--mj-line);
    }

    .who {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .badge {
      padding: 1px 7px;
      border-radius: 4px;
      background: var(--mj-ok);
      color: #10210f;
      font-size: 11px;
      font-weight: 700;
    }

    .badge.noten {
      background: var(--mj-surface-raised);
      color: var(--mj-text-muted);
    }

    .hand {
      display: flex;
      gap: 1px;
      flex-wrap: wrap;
    }

    .delta {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      color: var(--mj-ok);
    }

    .delta.negative {
      color: var(--mj-danger);
    }

    .dismiss {
      justify-self: end;
      font: inherit;
      font-weight: 600;
      min-height: 44px;
      padding: 0 22px;
      border-radius: 8px;
      border: 1px solid var(--mj-line);
      background: var(--mj-surface-raised);
      color: var(--mj-text);
      cursor: pointer;
    }
  `,
})
export class RyuukyokuOverlayComponent {
  readonly event = input.required<RyuukyokuEvent>();
  readonly players = input<readonly PlayerInfo[]>([]);

  readonly dismiss = output<void>();

  protected readonly reasonLabel = computed(() => REASON_LABEL[this.event().reason]);
  protected readonly nagashi = computed(() => this.event().nagashi ?? []);

  protected readonly nagashiNames = computed(() =>
    this.nagashi()
      .map((seat) => this.players()[seat]?.displayName ?? `Seat ${String(seat)}`)
      .join(', '),
  );

  protected readonly seats = computed(() =>
    this.event().scoreDeltas.map((delta, index) => ({
      index,
      delta,
      name: this.players()[index]?.displayName ?? `Seat ${String(index)}`,
      tenpai: this.event().tenpai[index] === true,
      hand: this.event().hands[index] ?? null,
    })),
  );
}
