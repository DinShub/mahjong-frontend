import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { PlayerInfo, Wind } from '@contracts/actions';
import type { ConnectionState } from '@contracts/views';

import { WIND_KANJI, WIND_NAME } from '../state/seat-position';

/**
 * Who is sitting here, and the turn ring.
 *
 * The ring is on the avatar rather than floating over the board because `docs/08-graphics-ux.md`
 * §5 puts "whose turn it is" first in reading priority, and a timer that is not attached to a
 * person is a timer you have to look up. Bots are always labelled (`docs/10-bots.md` §5).
 */
@Component({
  selector: 'mj-nameplate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'mj-nameplate',
    '[class.active]': 'active()',
    '[class.riichi]': 'riichi()',
    '[attr.data-testid]': 'testId()',
    '[attr.data-connection]': 'connection()',
  },
  template: `
    <div class="avatar" [class.ticking]="active() && progress() !== null">
      @if (progress(); as fraction) {
        <svg class="ring" viewBox="0 0 44 44" aria-hidden="true">
          <circle class="track" cx="22" cy="22" r="19" />
          <circle
            class="bar"
            cx="22"
            cy="22"
            r="19"
            [attr.stroke-dasharray]="circumference"
            [attr.stroke-dashoffset]="circumference * (1 - fraction)"
            [class.urgent]="fraction < 0.25"
          />
        </svg>
      }
      <span class="initial" aria-hidden="true">{{ initial() }}</span>
    </div>

    <div class="text">
      <span class="name" [attr.data-testid]="testId() + '-name'">{{ player().displayName }}</span>
      <span class="tags">
        <span class="wind" [attr.aria-label]="windName() + ' seat'">{{ windKanji() }}</span>
        @if (player().isBot) {
          <span class="tag bot" data-testid="bot-tag">bot</span>
        }
        @if (connection() === 'disconnected') {
          <span class="tag warn">offline</span>
        }
        @if (connection() === 'bot') {
          <span class="tag warn" data-testid="taken-over">played by bot</span>
        }
        @if (riichi()) {
          <span class="tag riichi-tag" data-testid="riichi-tag">riichi</span>
        }
      </span>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px 4px 4px;
      border-radius: 999px;
      border: 1px solid transparent;
      background: color-mix(in srgb, var(--mj-felt-edge) 65%, transparent);
      max-width: 220px;
    }

    :host(.active) {
      border-color: var(--mj-turn-ring);
      background: color-mix(in srgb, var(--mj-turn-ring) 14%, var(--mj-felt-edge));
    }

    :host(.riichi) {
      box-shadow: 0 0 0 2px var(--mj-riichi-accent);
    }

    .avatar {
      position: relative;
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--mj-surface-raised);
      font-weight: 700;
      flex: none;
    }

    .ring {
      position: absolute;
      inset: -5px;
      width: 44px;
      height: 44px;
      rotate: -90deg;
    }

    .track {
      fill: none;
      stroke: color-mix(in srgb, var(--mj-line) 70%, transparent);
      stroke-width: 3;
    }

    .bar {
      fill: none;
      stroke: var(--mj-turn-ring);
      stroke-width: 3;
      stroke-linecap: round;
    }

    .bar.urgent {
      stroke: var(--mj-danger);
    }

    .text {
      display: grid;
      gap: 1px;
      min-width: 0;
    }

    .name {
      font-size: 13px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tags {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: var(--mj-text-muted);
    }

    .tag {
      padding: 0 5px;
      border-radius: 4px;
      background: var(--mj-surface-raised);
    }

    .tag.warn {
      background: color-mix(in srgb, var(--mj-danger) 30%, var(--mj-surface-raised));
      color: var(--mj-text);
    }

    .tag.riichi-tag {
      background: var(--mj-riichi-accent);
      color: #21160c;
      font-weight: 700;
    }
  `,
})
export class NameplateComponent {
  readonly player = input.required<PlayerInfo>();
  readonly wind = input.required<Wind>();
  readonly connection = input<ConnectionState>('online');
  readonly active = input(false);
  readonly riichi = input(false);
  /** `1` → full ring, `0` → out of time. `null` hides it. */
  readonly progress = input<number | null>(null);
  readonly testId = input('nameplate');

  protected readonly circumference = 2 * Math.PI * 19;

  protected readonly windKanji = computed(() => WIND_KANJI[this.wind()] ?? '');
  protected readonly windName = computed(() => WIND_NAME[this.wind()] ?? '');
  protected readonly initial = computed(() =>
    (this.player().displayName.trim()[0] ?? '?').toUpperCase(),
  );
}
