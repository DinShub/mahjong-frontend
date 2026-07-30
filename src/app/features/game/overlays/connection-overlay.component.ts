import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { ConnectionStatus } from '@core/socket/socket.types';

/**
 * Connection state, surfaced explicitly and never silently (`docs/07-frontend.md` §6).
 *
 * The table in that section maps five states to five treatments, and the distinction that matters
 * is *blocking versus not*: reconnecting is a banner because the board underneath is still the
 * last true thing the player saw, while a protocol mismatch is a full screen because nothing after
 * it can be trusted. A bot playing your seat is a modal because it is the only one of the five the
 * player can do something about.
 */
@Component({
  selector: 'mj-connection-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mj-connection', '[attr.data-testid]': '"connection-overlay"' },
  template: `
    @switch (mode()) {
      @case ('protocol-mismatch') {
        <div
          class="fullscreen"
          role="alertdialog"
          aria-modal="true"
          data-testid="protocol-mismatch"
        >
          <h2>Update required</h2>
          <p>
            This page is speaking an older version of the protocol than the server. Reload to
            update.
          </p>
          <button type="button" class="primary" data-testid="reload" (click)="reload.emit()">
            Reload
          </button>
        </div>
      }
      @case ('bot-takeover') {
        <div class="modal" role="alertdialog" aria-modal="true" data-testid="bot-takeover">
          <h2>A bot is playing your seat</h2>
          <p>
            You were disconnected for longer than the grace period. Your seat is still yours — take
            it back and you will be asked for your next decision.
          </p>
          <button type="button" class="primary" data-testid="reclaim" (click)="reclaim.emit()">
            Rejoin
          </button>
        </div>
      }
      @case ('resyncing') {
        <div class="scrim" data-testid="resyncing" role="status" aria-live="polite">
          <span class="spinner" aria-hidden="true"></span>
          <span>Resynchronising…</span>
        </div>
      }
      @case ('reconnecting') {
        <div class="banner" role="status" aria-live="polite" data-testid="reconnecting">
          <span class="spinner" aria-hidden="true"></span>
          <span class="text">Reconnecting…</span>
          @if (graceSeconds() !== null) {
            <span class="grace" data-testid="grace">
              {{ graceSeconds() }}s before a bot takes your seat
            </span>
          }
        </div>
      }
      @case ('demoted') {
        <div class="banner warn" role="status" data-testid="demoted">
          <span class="text">This tab is watching only — you opened the game somewhere newer.</span>
        </div>
      }
      @default {}
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: contents;
    }

    .banner {
      position: absolute;
      inset-block-start: 0;
      inset-inline: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 8px 16px;
      background: var(--mj-warn);
      color: #241a03;
      font-weight: 600;
      z-index: 40;
    }

    .banner.warn {
      background: var(--mj-surface-raised);
      color: var(--mj-text);
      border-block-end: 1px solid var(--mj-line);
    }

    .grace {
      font-weight: 500;
      opacity: 0.85;
    }

    .scrim,
    .modal,
    .fullscreen {
      position: absolute;
      inset: 0;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 12px;
      text-align: center;
      background: rgb(0 0 0 / 60%);
      z-index: 50;
    }

    .fullscreen {
      background: var(--mj-felt-edge);
    }

    .modal > *,
    .fullscreen > * {
      max-width: 460px;
    }

    h2 {
      margin: 0;
      font-size: 22px;
    }

    p {
      margin: 0;
      color: var(--mj-text-muted);
    }

    .primary {
      font: inherit;
      font-weight: 700;
      min-height: 44px;
      padding: 0 26px;
      border-radius: 8px;
      border: 1px solid var(--mj-accent);
      background: var(--mj-accent);
      color: var(--mj-accent-ink);
      cursor: pointer;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid currentcolor;
      border-block-start-color: transparent;
      animation: spin 0.9s linear infinite;
    }

    @keyframes spin {
      to {
        rotate: 360deg;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation: none;
        border-block-start-color: currentcolor;
        opacity: 0.5;
      }
    }
  `,
})
export class ConnectionOverlayComponent {
  readonly status = input.required<ConnectionStatus>();
  readonly resyncing = input(false);
  readonly demoted = input(false);
  readonly botTakeover = input(false);
  readonly graceSeconds = input<number | null>(null);

  readonly reload = output<void>();
  readonly reclaim = output<void>();

  protected readonly mode = computed<
    'none' | 'reconnecting' | 'resyncing' | 'bot-takeover' | 'protocol-mismatch' | 'demoted'
  >(() => {
    if (this.status() === 'protocol-mismatch') return 'protocol-mismatch';
    if (this.botTakeover()) return 'bot-takeover';
    if (this.status() === 'reconnecting' || this.status() === 'disconnected') return 'reconnecting';
    if (this.resyncing()) return 'resyncing';
    if (this.demoted()) return 'demoted';
    return 'none';
  });
}
