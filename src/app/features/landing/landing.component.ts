import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { OnInit } from '@angular/core';

import { APP_CONFIG } from '@core/config/app-config';
import { SocketService } from '@core/socket/socket.service';
import type { ConnectionStatus } from '@core/socket/socket.types';

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  disconnected: 'Disconnected',
  'protocol-mismatch': 'Update required',
};

/**
 * The M0 landing page: prove a real socket handshake, visibly.
 *
 * It becomes the "play as guest / login" screen in M4 (`docs/07-frontend.md` §2); the connection
 * indicator survives as the shared connection-state UI.
 */
@Component({
  selector: 'mj-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="landing">
      <header>
        <h1>Riichi Mahjong</h1>
        <p class="tagline">Four seats, any mix of humans and bots.</p>
      </header>

      <section class="status" [attr.data-status]="socket.status()" data-testid="connection">
        <span class="dot" aria-hidden="true"></span>
        <span class="label" data-testid="connection-label">{{ label() }}</span>
      </section>

      <dl class="detail">
        <dt>Server</dt>
        <dd data-testid="server-url">{{ config.socketUrl || 'same origin' }}</dd>

        <dt>Protocol</dt>
        <dd data-testid="protocol">v{{ config.protocolVersion }}</dd>

        @if (socket.hello(); as hello) {
          <dt>Session</dt>
          <dd data-testid="session">{{ hello.userId ?? 'guest (unauthenticated)' }}</dd>

          <dt>Clock skew</dt>
          <dd data-testid="skew">{{ socket.clockSkewMs() }} ms</dd>
        }
      </dl>

      @if (socket.lastError(); as error) {
        <p class="error" role="alert" data-testid="error">
          <strong>{{ error.code }}</strong> — {{ error.message }}
        </p>
      }

      @if (canRetry()) {
        <button type="button" (click)="socket.reconnect()" data-testid="retry">Retry</button>
      }
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--mj-felt);
      color: var(--mj-text);
    }

    .landing {
      max-width: 34rem;
      margin: 0 auto;
      padding: 4rem 1.5rem;
      display: grid;
      gap: 2rem;
      justify-items: start;
    }

    h1 {
      margin: 0;
      font-size: clamp(2rem, 6vw, 3rem);
      letter-spacing: -0.02em;
    }

    .tagline {
      margin: 0.35rem 0 0;
      color: var(--mj-text-muted);
    }

    .status {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.75rem 1.1rem;
      border: 1px solid var(--mj-line);
      border-radius: 999px;
      background: var(--mj-surface);
      font-weight: 600;
    }

    .dot {
      width: 0.6rem;
      height: 0.6rem;
      border-radius: 50%;
      background: var(--mj-text-muted);
    }

    /* Colour is never the sole carrier of meaning: the label always says the state in words. */
    .status[data-status='connected'] .dot {
      background: var(--mj-ok);
    }

    .status[data-status='connecting'] .dot,
    .status[data-status='reconnecting'] .dot {
      background: var(--mj-warn);
      animation: pulse 1.1s ease-in-out infinite;
    }

    .status[data-status='disconnected'] .dot,
    .status[data-status='protocol-mismatch'] .dot {
      background: var(--mj-danger);
    }

    @keyframes pulse {
      50% {
        opacity: 0.35;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .dot {
        animation: none;
      }
    }

    .detail {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.4rem 1.5rem;
      margin: 0;
      font-size: 0.95rem;
    }

    dt {
      color: var(--mj-text-muted);
    }

    dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
    }

    .error {
      margin: 0;
      color: var(--mj-danger);
      font-size: 0.95rem;
    }

    button {
      font: inherit;
      padding: 0.6rem 1.4rem;
      border: 1px solid var(--mj-line);
      border-radius: 0.5rem;
      background: var(--mj-surface);
      color: inherit;
      cursor: pointer;
    }

    button:hover {
      border-color: var(--mj-text-muted);
    }
  `,
})
export class LandingComponent implements OnInit {
  protected readonly socket = inject(SocketService);
  protected readonly config = inject(APP_CONFIG);

  protected readonly label = computed(() => STATUS_LABELS[this.socket.status()]);
  protected readonly canRetry = computed(() =>
    ['disconnected', 'protocol-mismatch', 'idle'].includes(this.socket.status()),
  );

  ngOnInit(): void {
    this.socket.connect();
  }
}
