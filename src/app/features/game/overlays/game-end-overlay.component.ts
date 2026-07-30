import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { Placement, PlayerInfo, RuleConfig } from '@contracts/actions';

interface PlacementRow {
  place: number;
  name: string;
  finalScore: number;
  /** Raw points minus the return target, in units of 1000 — the part uma is added to. */
  base: number;
  uma: number;
  oka: number;
  netScore: number;
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th'];

/**
 * Final placements, with the uma and oka shown as separate columns.
 *
 * Players check this. A single "net −24.5" with no working is the number people argue about after
 * a close game, so the breakdown is laid out the way the ruleset computes it: points over the
 * return target, plus uma, plus oka to first. The `netScore` column is the server's and the other
 * columns are derived *from the server's own inputs* — if they ever failed to add up, the
 * authoritative one is still the one on the right.
 */
@Component({
  selector: 'mj-game-end-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'mj-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-label]': '"final results"',
    '[attr.data-testid]': '"game-end-overlay"',
  },
  template: `
    <div class="sheet">
      <h2>Final placings</h2>

      <table>
        <thead>
          <tr>
            <th scope="col">Place</th>
            <th scope="col">Player</th>
            <th scope="col" class="num">Points</th>
            <th scope="col" class="num">Over return</th>
            <th scope="col" class="num">Uma</th>
            <th scope="col" class="num">Oka</th>
            <th scope="col" class="num">Net</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.place) {
            <tr [attr.data-testid]="'placement-' + row.place">
              <td class="place">{{ ordinal(row.place) }}</td>
              <td class="name">{{ row.name }}</td>
              <td class="num">{{ row.finalScore }}</td>
              <td class="num">{{ signed(row.base) }}</td>
              <td class="num">{{ signed(row.uma) }}</td>
              <td class="num">{{ row.oka === 0 ? '—' : signed(row.oka) }}</td>
              <td class="num net" [class.negative]="row.netScore < 0">
                {{ signed(row.netScore) }}
              </td>
            </tr>
          }
        </tbody>
      </table>

      @if (seed(); as value) {
        <p class="seed" data-testid="seed">
          Wall seed <code>{{ value }}</code> — published now so the deal can be checked against the
          hash from the start of the game.
        </p>
      }

      <div class="actions">
        <button type="button" class="ghost" data-testid="game-end-lobby" (click)="leave.emit()">
          Back to the lobby
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgb(0 0 0 / 65%);
      z-index: 30;
    }

    .sheet {
      display: grid;
      gap: 16px;
      max-width: 780px;
      padding: 26px 30px;
      border-radius: 14px;
      background: var(--mj-surface);
      border: 1px solid var(--mj-line);
      box-shadow: 0 18px 50px rgb(0 0 0 / 45%);
    }

    h2 {
      margin: 0;
      font-size: 22px;
    }

    table {
      border-collapse: collapse;
      font-size: 14px;
    }

    th,
    td {
      padding: 6px 10px;
      text-align: left;
      border-block-end: 1px solid color-mix(in srgb, var(--mj-line) 50%, transparent);
    }

    th {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--mj-text-muted);
    }

    .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .place {
      font-weight: 700;
    }

    .name {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .net {
      font-weight: 700;
      color: var(--mj-ok);
    }

    .net.negative {
      color: var(--mj-danger);
    }

    .seed {
      margin: 0;
      font-size: 12px;
      color: var(--mj-text-muted);
    }

    code {
      word-break: break-all;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    .ghost {
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
export class GameEndOverlayComponent {
  readonly placements = input.required<readonly Placement[]>();
  readonly players = input<readonly PlayerInfo[]>([]);
  readonly config = input<RuleConfig | null>(null);
  readonly seed = input<string | null>(null);

  readonly leave = output<void>();

  protected readonly rows = computed<PlacementRow[]>(() => {
    const config = this.config();
    const returnPoints = config?.returnPoints ?? 30_000;
    const startingPoints = config?.startingPoints ?? 25_000;
    const uma = config?.uma ?? [15, 5, -5, -15];
    // Oka is the whole pool of (return − starting) from four players, awarded to first.
    const oka = ((returnPoints - startingPoints) * 4) / 1000;

    return [...this.placements()]
      .sort((a, b) => a.place - b.place)
      .map((placement) => ({
        place: placement.place,
        name: this.players()[placement.seat]?.displayName ?? `Seat ${String(placement.seat)}`,
        finalScore: placement.finalScore,
        base: (placement.finalScore - returnPoints) / 1000,
        uma: uma[placement.place - 1] ?? 0,
        oka: placement.place === 1 ? oka : 0,
        netScore: placement.netScore,
      }));
  });

  protected ordinal(place: number): string {
    return ORDINAL[place] ?? String(place);
  }

  protected signed(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return rounded > 0 ? `+${String(rounded)}` : String(rounded);
  }
}
