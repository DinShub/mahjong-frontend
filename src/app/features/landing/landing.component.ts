import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthError, AuthService } from '@core/auth/auth.service';
import { APP_CONFIG } from '@core/config/app-config';
import { SessionService } from '@core/session/session.service';
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

type Mode = 'guest' | 'login' | 'register';

/**
 * The way in.
 *
 * A guest account already exists by the time this renders — the app initializer creates one so the
 * socket has a token to hand over — so "play as guest" is a navigation, not a signup. Registering
 * *upgrades* that same account instead of making a second one, which is why a player who signs up
 * after ten games still has ten games.
 *
 * The connection indicator from M0 stays. It is the only place in the app that shows the handshake
 * itself, and "it says connected" remains the cheapest smoke test this project has.
 */
@Component({
  selector: 'mj-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
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

      <div class="actions">
        <button type="button" class="primary" data-testid="play-guest" (click)="play()">
          Play as {{ auth.isGuest() ? 'guest' : auth.displayName() }}
        </button>
        @if (auth.isGuest()) {
          <button
            type="button"
            class="ghost"
            data-testid="show-register"
            (click)="mode.set('register')"
          >
            Create an account
          </button>
          <button type="button" class="ghost" data-testid="show-login" (click)="mode.set('login')">
            Sign in
          </button>
        } @else {
          <button type="button" class="ghost" data-testid="sign-out" (click)="signOut()">
            Sign out
          </button>
        }
      </div>

      @if (mode() !== 'guest') {
        <form class="panel" (ngSubmit)="submit()" data-testid="auth-form">
          <h2>{{ mode() === 'login' ? 'Sign in' : 'Create an account' }}</h2>
          @if (mode() === 'register') {
            <p class="hint">
              Your current guest account is upgraded in place — the games you have already played
              stay yours.
            </p>
          }
          <label>
            Email
            <input
              type="email"
              name="email"
              [(ngModel)]="email"
              required
              autocomplete="email"
              data-testid="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              [(ngModel)]="password"
              required
              [attr.autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'"
              data-testid="password"
            />
          </label>
          @if (mode() === 'register') {
            <label>
              Display name
              <input
                type="text"
                name="displayName"
                [(ngModel)]="displayName"
                autocomplete="nickname"
                data-testid="display-name"
              />
            </label>
          }
          <div class="form-actions">
            <button type="submit" class="primary" [disabled]="busy()" data-testid="auth-submit">
              {{ mode() === 'login' ? 'Sign in' : 'Create account' }}
            </button>
            <button type="button" class="ghost" (click)="mode.set('guest')">Cancel</button>
          </div>
          @if (authError(); as message) {
            <p class="error" role="alert" data-testid="auth-error">{{ message }}</p>
          }
        </form>
      }

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

    h2 {
      margin: 0;
      font-size: 1.1rem;
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

    .actions,
    .form-actions {
      display: flex;
      gap: 0.6rem;
      flex-wrap: wrap;
    }

    .panel {
      display: grid;
      gap: 0.75rem;
      width: 100%;
      padding: 1.25rem;
      border-radius: 12px;
      background: var(--mj-surface);
      border: 1px solid var(--mj-line);
    }

    label {
      display: grid;
      gap: 0.25rem;
      font-size: 0.85rem;
      color: var(--mj-text-muted);
    }

    input {
      font: inherit;
      min-height: 44px;
      padding: 0 0.6rem;
      border-radius: 8px;
      border: 1px solid var(--mj-line);
      background: var(--mj-felt-edge);
      color: var(--mj-text);
    }

    .hint {
      margin: 0;
      font-size: 0.85rem;
      color: var(--mj-text-muted);
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
      font-weight: 600;
      min-height: 44px;
      padding: 0.6rem 1.4rem;
      border: 1px solid var(--mj-line);
      border-radius: 0.5rem;
      background: var(--mj-surface);
      color: inherit;
      cursor: pointer;
    }

    button.primary {
      background: var(--mj-accent);
      border-color: var(--mj-accent);
      color: var(--mj-accent-ink);
    }

    button:hover {
      border-color: var(--mj-text-muted);
    }

    button[disabled] {
      opacity: 0.6;
      cursor: progress;
    }
  `,
})
export class LandingComponent {
  protected readonly socket = inject(SocketService);
  protected readonly config = inject(APP_CONFIG);
  protected readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly mode = signal<Mode>('guest');
  protected readonly busy = signal(false);
  protected readonly authError = signal<string | null>(null);

  protected email = '';
  protected password = '';
  protected displayName = '';

  protected readonly label = computed(() => STATUS_LABELS[this.socket.status()]);
  protected readonly canRetry = computed(() =>
    ['disconnected', 'protocol-mismatch', 'idle'].includes(this.socket.status()),
  );

  protected async play(): Promise<void> {
    await this.auth.ensureSession();
    this.session.adoptNewToken();
    await this.router.navigate(['/lobby']);
  }

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.authError.set(null);
    try {
      if (this.mode() === 'login') {
        await this.auth.login({ email: this.email, password: this.password });
      } else if (this.auth.isAuthenticated() && this.auth.isGuest()) {
        // Upgrade rather than register: same user id, same history.
        await this.auth.upgrade({
          email: this.email,
          password: this.password,
          ...(this.displayName.trim().length > 0 ? { displayName: this.displayName.trim() } : {}),
        });
      } else {
        await this.auth.register({
          email: this.email,
          password: this.password,
          displayName: this.displayName.trim(),
        });
      }
      this.session.adoptNewToken();
      this.mode.set('guest');
      await this.router.navigate(['/lobby']);
    } catch (error) {
      this.authError.set(
        error instanceof AuthError ? describe(error) : 'Something went wrong. Try again.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.session.signOut();
  }
}

function describe(error: AuthError): string {
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return 'That email and password do not match an account.';
    case 'EMAIL_TAKEN':
      return 'That email is already registered — sign in instead.';
    case 'DISPLAY_NAME_TAKEN':
      return 'That display name is taken.';
    case 'WEAK_PASSWORD':
      return 'Pick a longer password that is not in a breach list.';
    case 'INVALID_DISPLAY_NAME':
      return 'That display name is not allowed.';
    case 'ACCOUNT_DISABLED':
      return 'That account is disabled.';
    case 'NETWORK':
      return 'The server is unreachable.';
    default:
      return error.message;
  }
}
