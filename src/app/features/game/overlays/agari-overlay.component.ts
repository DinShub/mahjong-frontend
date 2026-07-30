import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import type { AgariEvent, AgariResult, PlayerInfo } from '@contracts/actions';
import type { TileStr } from '@contracts/tiles';

import { SettingsService } from '@core/settings/settings.service';

import { TileComponent } from '@shared/tiles/tile.component';
import { limitName, yakuName } from '@shared/yaku/yaku-names';

import { MeldsComponent } from '../render/melds.component';

interface YakuRow {
  name: string;
  han: string;
}

/**
 * The win.
 *
 * Everything shown here comes out of `AgariResult` — han, fu, the yaku list, the dora counts, the
 * per-seat deltas. None of it is recomputed: the server has already decided which decomposition
 * pays best, and a client that added its own arithmetic would eventually disagree with the score
 * it is displaying next to it.
 *
 * A double ron renders both winners, in head-bump order as the server sent them.
 */
@Component({
  selector: 'mj-agari-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MeldsComponent, TileComponent],
  host: {
    class: 'mj-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-label]': '"hand result"',
    '[attr.data-testid]': '"agari-overlay"',
  },
  template: `
    <div class="sheet">
      @for (winner of winners(); track winner.result.seat) {
        <article class="winner" [attr.data-testid]="'winner-' + winner.result.seat">
          <header>
            <h2>{{ winner.name }}</h2>
            <span class="how" data-testid="win-kind">{{ winner.kind }}</span>
            @if (winner.limit !== null) {
              <span class="limit" data-testid="limit-name">{{ winner.limit }}</span>
            }
          </header>

          <div class="hand">
            @for (tile of winner.result.hand; track $index) {
              <mj-tile
                [tile]="tile"
                size="meld"
                [class.winning]="tile === winner.result.winningTile"
              />
            }
            <mj-melds
              [melds]="winner.result.melds"
              [owner]="winner.result.seat"
              size="meld"
              [testId]="'agari-melds-' + winner.result.seat"
            />
          </div>

          <table class="yaku">
            <tbody>
              @for (row of winner.yaku; track row.name) {
                <tr>
                  <td>{{ row.name }}</td>
                  <td class="han">{{ row.han }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td [attr.data-testid]="'han-fu-' + winner.result.seat">
                  {{ winner.result.han }} han{{
                    winner.result.fu > 0 ? ', ' + winner.result.fu + ' fu' : ''
                  }}
                </td>
                <td class="han points" [attr.data-testid]="'points-' + winner.result.seat">
                  {{ winner.result.points }}
                </td>
              </tr>
            </tfoot>
          </table>
        </article>
      }

      <div class="deltas" data-testid="score-deltas">
        @for (delta of deltas(); track $index) {
          <div
            class="delta"
            [class.negative]="delta.value < 0"
            [attr.data-testid]="'delta-' + $index"
          >
            <span class="who">{{ delta.name }}</span>
            <span class="value">{{ delta.value > 0 ? '+' : '' }}{{ delta.value }}</span>
          </div>
        }
      </div>

      @if (uraIndicators().length > 0) {
        <div class="ura" data-testid="ura-indicators">
          <span class="label">ura</span>
          @for (tile of uraIndicators(); track $index) {
            <mj-tile [tile]="tile" size="tiny" />
          }
        </div>
      }

      <button type="button" class="dismiss" data-testid="dismiss-agari" (click)="dismiss.emit()">
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
      max-width: 880px;
      max-height: 90%;
      overflow: auto;
      padding: 22px 26px;
      border-radius: 14px;
      background: var(--mj-surface);
      border: 1px solid var(--mj-line);
      box-shadow: 0 18px 50px rgb(0 0 0 / 45%);
    }

    .winner {
      display: grid;
      gap: 10px;
    }

    header {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }

    h2 {
      margin: 0;
      font-size: 20px;
    }

    .how {
      font-size: 13px;
      color: var(--mj-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .limit {
      margin-inline-start: auto;
      padding: 2px 10px;
      border-radius: 999px;
      background: var(--mj-accent);
      color: var(--mj-accent-ink);
      font-weight: 700;
      font-size: 13px;
    }

    .hand {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      flex-wrap: wrap;
    }

    .hand mj-tile.winning {
      box-shadow: 0 0 0 2px var(--mj-accent);
      border-radius: 5px;
    }

    .hand mj-melds {
      margin-inline-start: 16px;
    }

    .yaku {
      border-collapse: collapse;
      font-size: 14px;
      min-width: 320px;
    }

    .yaku td {
      padding: 2px 0;
    }

    .yaku .han {
      text-align: right;
      padding-inline-start: 24px;
      font-variant-numeric: tabular-nums;
    }

    .yaku tfoot td {
      border-block-start: 1px solid var(--mj-line);
      padding-block-start: 5px;
      font-weight: 700;
    }

    .yaku .points {
      color: var(--mj-accent);
    }

    .deltas {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      padding-block-start: 8px;
      border-block-start: 1px solid var(--mj-line);
    }

    .delta {
      display: grid;
      gap: 2px;
      font-variant-numeric: tabular-nums;
    }

    .delta .who {
      font-size: 11px;
      color: var(--mj-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .delta .value {
      font-size: 18px;
      font-weight: 700;
      color: var(--mj-ok);
    }

    .delta.negative .value {
      color: var(--mj-danger);
    }

    .ura {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .ura .label {
      font-size: 11px;
      color: var(--mj-text-muted);
      margin-inline-end: 4px;
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
export class AgariOverlayComponent {
  private readonly settings = inject(SettingsService);

  readonly event = input.required<AgariEvent>();
  readonly players = input<readonly PlayerInfo[]>([]);

  readonly dismiss = output<void>();

  protected readonly uraIndicators = computed<readonly TileStr[]>(
    () => this.event().uraIndicators ?? [],
  );

  protected readonly winners = computed(() =>
    this.event().winners.map((result) => ({
      result,
      name: this.nameOf(result.seat),
      kind: result.from === result.seat ? 'tsumo' : `ron off ${this.nameOf(result.from)}`,
      limit:
        result.limitName === null ? null : limitName(result.limitName, this.settings.yakuNaming()),
      yaku: this.yakuRows(result),
    })),
  );

  protected readonly deltas = computed(() =>
    this.event().scoreDeltas.map((value, seat) => ({ value, name: this.nameOf(seat) })),
  );

  private yakuRows(result: AgariResult): YakuRow[] {
    const naming = this.settings.yakuNaming();
    const rows: YakuRow[] = result.yakuman.map((id) => ({
      name: yakuName(id, naming),
      han: 'yakuman',
    }));

    if (rows.length === 0) {
      rows.push(
        ...result.yaku.map((value) => ({
          name: yakuName(value.name, naming),
          han: String(value.han),
        })),
      );
      // Dora are not yaku and are listed apart, as every scoring table does.
      if (result.dora > 0) rows.push({ name: 'dora', han: String(result.dora) });
      if (result.redDora > 0) rows.push({ name: 'red dora', han: String(result.redDora) });
      if (result.uraDora > 0) rows.push({ name: 'ura dora', han: String(result.uraDora) });
    }
    return rows;
  }

  private nameOf(seat: number): string {
    return this.players()[seat]?.displayName ?? `Seat ${String(seat)}`;
  }
}
