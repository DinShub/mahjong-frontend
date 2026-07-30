import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { Wind } from '@contracts/actions';

import { WIND_NAME } from '../state/seat-position';

/**
 * The card between hands.
 *
 * It exists because the board is being rebuilt underneath it — every pond emptied, every hand
 * replaced — and a cut straight from a finished hand to a fresh one reads as a glitch. 400 ms is
 * the `hand-start` dwell, so this is on screen for exactly as long as the queue is holding.
 */
@Component({
  selector: 'mj-hand-transition',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'mj-hand-transition',
    role: 'status',
    'aria-live': 'polite',
    '[attr.data-testid]': '"hand-transition"',
  },
  template: `
    <div class="card">
      <span class="round" data-testid="transition-round">{{ title() }}</span>
      @if (honba() > 0) {
        <span class="honba">{{ honba() }} honba</span>
      }
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgb(0 0 0 / 45%);
      z-index: 15;
      pointer-events: none;
    }

    .card {
      display: grid;
      gap: 4px;
      justify-items: center;
      padding: 18px 40px;
      border-radius: 12px;
      background: var(--mj-surface);
      border: 1px solid var(--mj-line);
      animation: rise 220ms ease-out;
    }

    .round {
      font-size: 26px;
      font-weight: 700;
    }

    .honba {
      font-size: 13px;
      color: var(--mj-text-muted);
    }

    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .card {
        animation: none;
      }
    }
  `,
})
export class HandTransitionComponent {
  readonly round = input.required<Wind>();
  readonly kyoku = input.required<number>();
  readonly honba = input(0);

  protected readonly title = computed(
    () => `${WIND_NAME[this.round()] ?? 'East'} ${String(this.kyoku())}`,
  );
}
