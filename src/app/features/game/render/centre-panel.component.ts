import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { Seat, Wind } from '@contracts/actions';
import type { TileStr } from '@contracts/tiles';

import { AnimateInDirective } from '@shared/motion/animate-in.directive';

import { DoraStripComponent } from './dora-strip.component';
import {
  POS_BOTTOM,
  POS_LEFT,
  POS_RIGHT,
  POS_TOP,
  WIND_KANJI,
  seatWindOf,
} from '../state/seat-position';
import type { SeatPos } from '../state/seat-position';

interface ScoreSlot {
  pos: SeatPos;
  seat: Seat;
  score: number;
  wind: Wind;
  windKanji: string;
  isDealer: boolean;
  isTurn: boolean;
  riichi: boolean;
  name: string;
  delta: number | null;
}

/**
 * The centre: round, honba, wall count, the dora indicators, and four scores in seat position.
 *
 * Ordered by `docs/08-graphics-ux.md` §5 — whose turn it is and who is in riichi come first, and
 * both get a shape as well as a colour. The riichi stick drawn on a player's side of the centre is
 * the single most important piece of state in the game, so it is a physical object on the table
 * rather than a badge on their name.
 *
 * **The dora indicators live here, not bottom right.** §5 puts them in the corner; they are in the
 * middle because that is where a player looks, and because the corner put the one tile that changes
 * what every hand in the game is worth in the furthest place from everything else on the board.
 */
@Component({
  selector: 'mj-centre-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnimateInDirective, DoraStripComponent],
  host: { class: 'mj-centre', '[attr.data-testid]': '"centre-panel"' },
  template: `
    <div class="face">
      <div class="round" data-testid="round">
        <span class="kanji">{{ roundKanji() }}</span>
        <span class="kyoku">{{ kyoku() }}</span>
      </div>
      <div class="meta">
        <span data-testid="honba" [attr.aria-label]="honba() + ' honba'">{{ honba() }}本場</span>
        <span
          data-testid="sticks"
          [attr.aria-label]="riichiSticks() + ' riichi sticks on the table'"
        >
          <span class="stick-icon" aria-hidden="true"></span>{{ riichiSticks() }}
        </span>
      </div>
      <div
        class="wall"
        data-testid="wall-count"
        [attr.aria-label]="wallRemaining() + ' tiles left in the wall'"
      >
        {{ wallRemaining() }}
      </div>

      <mj-dora-strip [indicators]="doraIndicators()" [ura]="ura()" />
    </div>

    @for (slot of slots(); track slot.seat) {
      <div
        class="score"
        [class]="'at-' + slot.pos"
        [class.turn]="slot.isTurn"
        [class.riichi]="slot.riichi"
        [attr.data-testid]="'score-' + slot.pos"
        [attr.data-seat]="slot.seat"
      >
        <span class="wind" [class.dealer]="slot.isDealer" aria-hidden="true">{{
          slot.windKanji
        }}</span>
        <span class="value" [attr.data-testid]="'score-value-' + slot.pos">{{ slot.score }}</span>
        @if (slot.delta !== null) {
          <span
            class="delta"
            [class.negative]="slot.delta < 0"
            [attr.data-testid]="'score-delta-' + slot.pos"
            mjAnimateIn="score"
          >
            {{ slot.delta > 0 ? '+' : '' }}{{ slot.delta }}
          </span>
        }
        @if (slot.riichi) {
          <span class="stick" aria-label="in riichi"></span>
        }
        <span class="sr-only">{{ slot.name }}, {{ slot.score }} points</span>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      width: 300px;
      height: 300px;
    }

    /* Inset far enough to clear the four score pills at the panel's edges, and no further: the
       dora row needs 5 × 30 px of width inside it. */
    .face {
      position: absolute;
      inset: 38px;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 4px;
      padding: 6px;
      text-align: center;
      border-radius: 10px;
      background: var(--mj-felt-edge);
      border: 1px solid var(--mj-line);
      box-shadow: 0 2px 12px rgb(0 0 0 / 35%);
    }

    mj-dora-strip {
      margin-block-start: 2px;
    }

    .round {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 2px;
      font-size: 30px;
      font-weight: 700;
      line-height: 1;
    }

    .kyoku {
      font-size: 22px;
    }

    .meta {
      display: flex;
      gap: 10px;
      justify-content: center;
      font-size: 13px;
      color: var(--mj-text-muted);
      font-variant-numeric: tabular-nums;
    }

    .stick-icon {
      display: inline-block;
      width: 14px;
      height: 4px;
      margin-inline-end: 4px;
      border-radius: 2px;
      background: var(--mj-riichi-stick);
      box-shadow: 0 0 0 1px var(--mj-riichi-accent) inset;
      vertical-align: middle;
    }

    .wall {
      font-size: 17px;
      font-variant-numeric: tabular-nums;
    }

    .wall::after {
      content: ' left';
      font-size: 11px;
      color: var(--mj-text-muted);
    }

    .score {
      position: absolute;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 999px;
      border: 1px solid transparent;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .score.at-0 {
      inset-block-end: 4px;
      inset-inline-start: 50%;
      translate: -50% 0;
    }
    .score.at-1 {
      inset-inline-end: 0;
      inset-block-start: 50%;
      translate: 0 -50%;
    }
    .score.at-2 {
      inset-block-start: 4px;
      inset-inline-start: 50%;
      translate: -50% 0;
    }
    .score.at-3 {
      inset-inline-start: 0;
      inset-block-start: 50%;
      translate: 0 -50%;
    }

    /* Whose turn: an outline, not a tint — it has to survive both themes and colour blindness. */
    .score.turn {
      border-color: var(--mj-turn-ring);
      background: color-mix(in srgb, var(--mj-turn-ring) 16%, transparent);
    }

    .score.riichi .value {
      color: var(--mj-riichi-accent);
      font-weight: 700;
    }

    .wind {
      font-size: 15px;
      color: var(--mj-text-muted);
    }

    .wind.dealer {
      color: var(--mj-accent);
      font-weight: 700;
    }

    .value {
      font-size: 16px;
      font-weight: 600;
    }

    .delta {
      font-size: 13px;
      color: var(--mj-ok);
    }

    .delta.negative {
      color: var(--mj-danger);
    }

    .stick {
      width: 22px;
      height: 5px;
      border-radius: 3px;
      background: var(--mj-riichi-stick);
      box-shadow: 0 0 0 1px var(--mj-riichi-accent) inset;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class CentrePanelComponent {
  readonly round = input.required<Wind>();
  readonly kyoku = input.required<number>();
  readonly honba = input.required<number>();
  readonly riichiSticks = input.required<number>();
  readonly wallRemaining = input.required<number>();
  readonly dealer = input.required<Seat>();
  readonly turn = input<Seat | null>(null);
  readonly scores = input.required<readonly number[]>();
  readonly names = input<readonly string[]>([]);
  readonly riichiSeats = input<readonly Seat[]>([]);
  /** Per absolute seat; shown next to the score while a change is animating. */
  readonly deltas = input<readonly (number | null)[]>([]);
  readonly mySeat = input<Seat | null>(null);
  readonly doraIndicators = input<readonly TileStr[]>([]);
  readonly ura = input<readonly TileStr[]>([]);

  protected readonly roundKanji = computed(() => WIND_KANJI[this.round()] ?? '東');

  protected readonly slots = computed<ScoreSlot[]>(() => {
    const mine = this.mySeat();
    const dealer = this.dealer();
    const riichi = new Set(this.riichiSeats());
    const positions = [POS_BOTTOM, POS_RIGHT, POS_TOP, POS_LEFT];

    return positions.map((pos) => {
      const seat = ((pos + (mine ?? 0)) % 4) as Seat;
      const wind = seatWindOf(seat, dealer);
      return {
        pos,
        seat,
        score: this.scores()[seat] ?? 0,
        wind,
        windKanji: WIND_KANJI[wind] ?? '',
        isDealer: seat === dealer,
        isTurn: this.turn() === seat,
        riichi: riichi.has(seat),
        name: this.names()[seat] ?? `Seat ${String(seat)}`,
        delta: this.deltas()[seat] ?? null,
      };
    });
  });
}
