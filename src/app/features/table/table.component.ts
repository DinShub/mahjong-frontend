import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import type { BotLevel, Seat } from '@contracts/actions';
import type { SeatFill } from '@contracts/views';

import { SocketService } from '@core/socket/socket.service';

import { TableStore } from './table.store';

/**
 * The pre-game table: seats, ready states, and the countdown.
 *
 * `table:state` is the only thing this screen trusts. Every control here sends a request and waits
 * for the state that comes back rather than updating locally first — a seat that looks taken
 * because *this* client clicked it, and is not, is the worst version of this screen.
 */
@Component({
  selector: 'mj-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mj-table', '[attr.data-testid]': '"table-screen"' },
  template: `
    <main>
      @if (state(); as table) {
        <header>
          <h1>Table</h1>
          <p class="meta">
            <span data-testid="table-length">{{
              table.length === 'hanchan' ? 'Hanchan' : 'Tonpuusen'
            }}</span>
            @if (table.isPrivate) {
              <span class="tag">private</span>
            }
            <span class="tag" data-testid="table-status">{{ table.status }}</span>
          </p>
          @if (table.inviteCode; as code) {
            <p class="invite">
              Invite code <code data-testid="invite-code">{{ code }}</code>
              <button
                type="button"
                class="link"
                data-testid="copy-invite"
                (click)="copyInvite(code)"
              >
                Copy link
              </button>
            </p>
          }
        </header>

        @if (countdown(); as seconds) {
          <p class="countdown" role="status" data-testid="countdown">Starting in {{ seconds }}…</p>
        }

        <ol class="seats">
          @for (seat of table.seats; track seat.seat) {
            <li
              class="seat"
              [class.mine]="seat.seat === mySeat()"
              [attr.data-testid]="'table-seat-' + seat.seat"
            >
              <span class="index">{{ seat.seat + 1 }}</span>
              <span class="name" [attr.data-testid]="'seat-name-' + seat.seat">
                {{ seat.player?.displayName ?? emptyLabel(seat.config.fill) }}
              </span>
              @if (seat.player?.isBot) {
                <span class="tag">bot · {{ seat.player?.botLevel }}</span>
              }
              @if (seat.connection === 'disconnected') {
                <span class="tag warn">offline</span>
              }
              <span
                class="ready"
                [class.on]="seat.ready"
                [attr.data-testid]="'seat-ready-' + seat.seat"
              >
                {{ seat.ready ? 'ready' : '—' }}
              </span>

              @if (isHost() && seat.player === null && seat.seat !== mySeat()) {
                <select
                  class="fill"
                  [value]="seat.config.fill"
                  [attr.data-testid]="'set-fill-' + seat.seat"
                  (change)="onFill(seat.seat, $event)"
                >
                  <option value="open">Open</option>
                  <option value="bot">Bot</option>
                  <option value="locked">Locked</option>
                </select>
                @if (seat.config.fill === 'bot') {
                  <select
                    class="fill"
                    [value]="seat.config.botLevel ?? 'normal'"
                    [attr.data-testid]="'set-level-' + seat.seat"
                    (change)="onLevel(seat.seat, $event)"
                  >
                    <option value="easy">Easy</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Hard</option>
                  </select>
                }
              }
            </li>
          }
        </ol>

        @if (mySeat() === null) {
          <p class="watching" role="status" data-testid="not-seated">
            You are watching this table, not sitting at it — no seat here is yours. Every seat is
            taken or closed to players.
          </p>
        }

        <div class="actions">
          @if (mySeat() !== null) {
            <button
              type="button"
              class="primary"
              [attr.aria-pressed]="amReady()"
              data-testid="toggle-ready"
              (click)="toggleReady()"
            >
              {{ amReady() ? 'Not ready' : 'Ready' }}
            </button>
          }
          @if (isHost()) {
            <button type="button" data-testid="start-now" (click)="start()">Start now</button>
          }
          <button type="button" class="ghost" data-testid="leave-table" (click)="leave()">
            Leave
          </button>
        </div>

        @if (notice(); as message) {
          <p class="notice" role="status" data-testid="table-notice">{{ message }}</p>
        }
        @if (error(); as message) {
          <p class="error" role="alert" data-testid="table-error">{{ message }}</p>
        }
      } @else {
        <p class="waiting" data-testid="table-waiting">Loading the table…</p>
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

    main {
      max-width: 40rem;
      margin: 0 auto;
      padding: 3rem 1.5rem;
      display: grid;
      gap: 1.25rem;
    }

    h1 {
      margin: 0;
      font-size: 1.9rem;
    }

    .meta {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin: 0.3rem 0 0;
      color: var(--mj-text-muted);
    }

    .tag {
      padding: 1px 7px;
      border-radius: 4px;
      background: var(--mj-surface-raised);
      font-size: 11px;
    }

    .tag.warn {
      background: color-mix(in srgb, var(--mj-danger) 35%, var(--mj-surface-raised));
    }

    .invite {
      margin: 0.6rem 0 0;
      font-size: 0.9rem;
      color: var(--mj-text-muted);
    }

    code {
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--mj-felt-edge);
      letter-spacing: 0.1em;
    }

    .link {
      margin-inline-start: 0.5rem;
      font: inherit;
      font-size: 0.85rem;
      background: none;
      border: none;
      color: var(--mj-accent);
      cursor: pointer;
      text-decoration: underline;
      min-height: 44px;
    }

    .countdown {
      margin: 0;
      padding: 0.6rem 1rem;
      border-radius: 8px;
      background: var(--mj-accent);
      color: var(--mj-accent-ink);
      font-weight: 700;
    }

    .seats {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.5rem;
    }

    .seat {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.6rem 0.9rem;
      border-radius: 10px;
      background: var(--mj-surface);
      border: 1px solid transparent;
    }

    .seat.mine {
      border-color: var(--mj-accent);
    }

    .index {
      width: 1.4rem;
      color: var(--mj-text-muted);
      font-variant-numeric: tabular-nums;
    }

    .name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ready {
      font-size: 0.8rem;
      color: var(--mj-text-muted);
    }

    .ready.on {
      color: var(--mj-ok);
      font-weight: 700;
    }

    .fill {
      font: inherit;
      font-size: 0.85rem;
      min-height: 36px;
      border-radius: 6px;
      border: 1px solid var(--mj-line);
      background: var(--mj-felt-edge);
      color: var(--mj-text);
    }

    .actions {
      display: flex;
      gap: 0.6rem;
      flex-wrap: wrap;
    }

    button {
      font: inherit;
      font-weight: 600;
      min-height: 44px;
      padding: 0 1.3rem;
      border-radius: 8px;
      border: 1px solid var(--mj-line);
      background: var(--mj-surface-raised);
      color: var(--mj-text);
      cursor: pointer;
    }

    button.primary {
      background: var(--mj-accent);
      border-color: var(--mj-accent);
      color: var(--mj-accent-ink);
    }

    .notice {
      margin: 0;
      color: var(--mj-text-muted);
    }

    /* Not an error — but it is the answer to "why can I not press Ready?", so it is not muted. */
    .watching {
      margin: 0;
      padding: 0.7rem 1rem;
      border-radius: 8px;
      border: 1px solid var(--mj-line);
      background: var(--mj-surface);
    }

    .error {
      margin: 0;
      color: var(--mj-danger);
    }

    .waiting {
      color: var(--mj-text-muted);
    }
  `,
})
export class TableComponent {
  private readonly store = inject(TableStore);
  private readonly socket = inject(SocketService);
  private readonly router = inject(Router);

  /** Bound from the route. */
  readonly tableId = input<string>('');

  protected readonly state = this.store.state;
  protected readonly countdown = this.store.countdown;
  protected readonly notice = this.store.notice;
  protected readonly error = this.store.error;
  protected readonly isHost = this.store.isHost;
  protected readonly mySeat = this.store.mySeat;
  protected readonly amReady = this.store.amReady;

  private readonly status = computed(() => this.store.state()?.status ?? null);

  constructor() {
    // Joining is idempotent server-side: for a seat that is already yours it is a reconnect.
    effect(() => {
      const id = this.tableId();
      if (id.length === 0 || !this.socket.isConnected()) return;
      if (this.store.tableId() === id) return;
      void this.store.join({ tableId: id });
    });

    // The game starting is the server's decision; this screen just follows it.
    effect(() => {
      if (this.status() !== 'in_progress') return;
      void this.router.navigate(['/game', this.tableId()]);
    });
  }

  protected emptyLabel(fill: SeatFill): string {
    switch (fill) {
      case 'bot':
        return 'Bot (filling)';
      case 'locked':
        return 'Locked';
      default:
        return 'Open';
    }
  }

  protected onFill(seat: Seat, event: Event): void {
    const fill = (event.target as HTMLSelectElement).value as SeatFill;
    void this.store.setSeat(seat, fill === 'bot' ? { fill, botLevel: 'normal' } : { fill });
  }

  protected onLevel(seat: Seat, event: Event): void {
    const botLevel = (event.target as HTMLSelectElement).value as BotLevel;
    void this.store.setSeat(seat, { fill: 'bot', botLevel });
  }

  protected toggleReady(): void {
    void this.store.setReady(!this.amReady());
  }

  protected start(): void {
    void this.store.start();
  }

  protected async leave(): Promise<void> {
    await this.store.leave(this.tableId());
    await this.router.navigate(['/lobby']);
  }

  protected copyInvite(code: string): void {
    const origin = globalThis.location?.origin ?? '';
    void globalThis.navigator?.clipboard?.writeText(`${origin}/lobby?invite=${code}`);
  }
}
