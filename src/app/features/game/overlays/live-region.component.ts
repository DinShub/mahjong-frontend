import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import type { GameEvent, PlayerInfo, Seat } from '@contracts/actions';
import type { TileStr } from '@contracts/tiles';

import { SettingsService } from '@core/settings/settings.service';

import { tileName } from '@shared/tiles/tile-names';
import { meldLabel } from '../render/meld-layout';

/**
 * What a screen reader hears.
 *
 * `docs/07-frontend.md` §7: the live region announces **public** events — discards, calls, riichi,
 * wins — and the player's *own* draws but nobody else's, because another seat's drawn tile is not
 * public and announcing it would be a hidden-information leak through the accessibility layer. The
 * projection already withholds it (`DrawEvent.tile` is null for everyone but the drawer), so the
 * rule holds by construction here; the check is still worth stating.
 *
 * `polite`, never `assertive`: a mahjong table produces an event every couple of seconds, and an
 * assertive region would interrupt the player mid-sentence every time somebody discarded.
 */
@Component({
  selector: 'mj-live-region',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'mj-live-region',
    role: 'log',
    'aria-live': 'polite',
    'aria-atomic': 'true',
    '[attr.data-testid]': '"live-region"',
  },
  template: `{{ announcement() }}`,
  styles: `
    :host {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class LiveRegionComponent {
  private readonly settings = inject(SettingsService);

  readonly event = input<GameEvent | null>(null);
  readonly players = input<readonly PlayerInfo[]>([]);
  readonly mySeat = input<Seat | null>(null);

  protected readonly announcement = computed(() => {
    const event = this.event();
    if (event === null) return '';
    const naming = this.settings.tileNaming();
    const who = (seat: Seat): string => this.nameOf(seat);
    const tile = (value: TileStr): string => tileName(value, naming);

    switch (event.t) {
      case 'hand-start':
        return `Hand ${String(event.kyoku)}, ${String(event.honba)} honba. Dora indicator ${tile(event.doraIndicator)}.`;
      case 'draw':
        // Only your own — an opponent's tile is not public and does not arrive here anyway.
        return event.tile === null ? '' : `You drew ${tile(event.tile)}.`;
      case 'discard':
        return `${who(event.seat)} discarded ${tile(event.tile)}${event.riichi ? ', declaring riichi' : ''}.`;
      case 'call':
        return `${who(event.seat)} called ${meldLabel(event.meld)} off ${who(event.from)}.`;
      case 'riichi-accepted':
        return `${who(event.seat)} is in riichi. ${String(event.sticks)} sticks on the table.`;
      case 'dora-revealed':
        return `New dora indicator: ${tile(event.indicator)}.`;
      case 'agari':
        return event.winners
          .map(
            (winner) =>
              `${who(winner.seat)} won ${String(winner.points)} points, ${String(winner.han)} han` +
              `${winner.fu > 0 ? ` ${String(winner.fu)} fu` : ''}.`,
          )
          .join(' ');
      case 'ryuukyoku':
        return `Draw. ${event.tenpai.filter(Boolean).length} players tenpai.`;
      case 'game-end':
        return 'The game is over.';
      default:
        return '';
    }
  });

  private nameOf(seat: Seat): string {
    if (seat === this.mySeat()) return 'You';
    return this.players()[seat]?.displayName ?? `Seat ${String(seat)}`;
  }
}
