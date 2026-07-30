import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import type { BotLevel, GameLength, Seat } from '@contracts/actions';
import type { SeatConfig, SeatFill } from '@contracts/views';

import { AuthService } from '@core/auth/auth.service';

import { TableStore } from '@features/table/table.store';

import { LobbyStore } from './lobby.store';

/** The four seats a `table:create` payload carries, in seat order. */
type SeatQuartet = [SeatConfig, SeatConfig, SeatConfig, SeatConfig];

/** The seat the creator sits in. */
const HOST_SEAT: Seat = 0;

/**
 * Seat 0 is `open`, not `locked`.
 *
 * The server seats the creator in the first seat whose fill is `open` — `docs/05-realtime-protocol.md`
 * §3, and `TableService.create()` implements exactly that. `locked` means *nobody may sit here*, so
 * a payload with no open seat is a table whose creator has nowhere to sit: they are not seated, the
 * Ready button never appears because it belongs to a seat, and "Start now" fills the last empty
 * chair with a fourth bot. Four bots then play a game the person who made the table can only watch.
 */
const DEFAULT_SEATS: SeatQuartet = [
  { fill: 'open' },
  { fill: 'bot', botLevel: 'normal' },
  { fill: 'bot', botLevel: 'normal' },
  { fill: 'bot', botLevel: 'normal' },
];

/**
 * Quickmatch, or a table of your own.
 *
 * Two ways in and they are deliberately different shapes: quickmatch is one button and a promise
 * that a table exists within the bot-fill deadline, and creating one is a form because every
 * decision it asks about — length, privacy, which seats are bots — is one the server cannot guess.
 */
@Component({
  selector: 'mj-lobby',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  host: { class: 'mj-lobby', '[attr.data-testid]': '"lobby"' },
  template: `
    <main>
      <header>
        <h1>Lobby</h1>
        <p class="who" data-testid="lobby-user">
          {{ auth.displayName() ?? 'Guest' }}
          @if (auth.isGuest()) {
            <span class="tag">guest</span>
          }
        </p>
      </header>

      <section class="panel">
        <h2>Quickmatch</h2>
        @if (lobby.isQueued()) {
          <div class="queue" data-testid="queue-status">
            <span class="spinner" aria-hidden="true"></span>
            <span>
              Searching…
              @if (lobby.queueStatus(); as status) {
                <span data-testid="queue-position">
                  position {{ status.position }} of {{ status.waiting }}, a table in
                  {{ status.etaSeconds }}s at the latest
                </span>
              }
            </span>
            <button type="button" class="ghost" data-testid="cancel-queue" (click)="cancel()">
              Cancel
            </button>
          </div>
        } @else {
          <div class="row">
            <label>
              Length
              <select [(ngModel)]="length" name="length" data-testid="quickmatch-length">
                <option value="hanchan">Hanchan (East + South)</option>
                <option value="tonpuusen">Tonpuusen (East only)</option>
              </select>
            </label>
            <button type="button" class="primary" data-testid="quickmatch" (click)="quickmatch()">
              Find a table
            </button>
          </div>
          <p class="hint">
            Everyone waiting is seated at one table; bots fill whatever is left when the wait runs
            out.
          </p>
        }
        @if (lobby.cancelled(); as cancelled) {
          <p class="notice" role="status" data-testid="queue-cancelled">
            Search stopped ({{ cancelled.reason }}).
          </p>
        }
        @if (lobby.error(); as error) {
          <p class="error" role="alert" data-testid="lobby-error">{{ error }}</p>
        }
      </section>

      <section class="panel">
        <h2>Create a table</h2>
        <div class="row">
          <label>
            Length
            <select [(ngModel)]="createLength" name="createLength" data-testid="create-length">
              <option value="hanchan">Hanchan</option>
              <option value="tonpuusen">Tonpuusen</option>
            </select>
          </label>
          <label class="check">
            <input
              type="checkbox"
              [(ngModel)]="isPrivate"
              name="private"
              data-testid="create-private"
            />
            Private (invite only)
          </label>
        </div>

        <div class="seats">
          @for (seat of seatIndices; track seat) {
            <div class="seat" [attr.data-testid]="'seat-config-' + seat">
              <span class="seat-label">{{ seat === 0 ? 'You' : 'Seat ' + seat }}</span>
              @if (seat > 0) {
                <select
                  [ngModel]="fillOf(seat)"
                  (ngModelChange)="setFill(seat, $event)"
                  [name]="'fill' + seat"
                  [attr.data-testid]="'seat-fill-' + seat"
                >
                  <option value="open">Open to players</option>
                  <option value="bot">Bot</option>
                  <option value="locked">Locked</option>
                </select>
                @if (fillOf(seat) === 'bot') {
                  <select
                    [ngModel]="levelOf(seat)"
                    (ngModelChange)="setLevel(seat, $event)"
                    [name]="'level' + seat"
                    [attr.data-testid]="'seat-level-' + seat"
                  >
                    <option value="easy">Easy</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Hard</option>
                  </select>
                }
              } @else {
                <span class="host-note">host</span>
              }
            </div>
          }
        </div>

        <button type="button" class="primary" data-testid="create-table" (click)="create()">
          Create table
        </button>
      </section>

      <section class="panel">
        <h2>Join by code</h2>
        <div class="row">
          <label>
            Invite code
            <input
              type="text"
              [(ngModel)]="inviteCode"
              name="invite"
              autocomplete="off"
              spellcheck="false"
              data-testid="invite-code"
            />
          </label>
          <button type="button" class="ghost" data-testid="join-code" (click)="joinByCode()">
            Join
          </button>
        </div>
        @if (tables.error(); as error) {
          <p class="error" role="alert" data-testid="table-error">{{ error }}</p>
        }
      </section>
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
      max-width: 46rem;
      margin: 0 auto;
      padding: 3rem 1.5rem 4rem;
      display: grid;
      gap: 1.5rem;
    }

    h1 {
      margin: 0;
      font-size: 2rem;
    }

    h2 {
      margin: 0 0 0.75rem;
      font-size: 1.05rem;
    }

    .who {
      margin: 0.25rem 0 0;
      color: var(--mj-text-muted);
    }

    .tag {
      margin-inline-start: 6px;
      padding: 1px 7px;
      border-radius: 4px;
      background: var(--mj-surface-raised);
      font-size: 11px;
    }

    .panel {
      padding: 1.25rem;
      border-radius: 12px;
      background: var(--mj-surface);
      border: 1px solid var(--mj-line);
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 1rem;
    }

    label {
      display: grid;
      gap: 0.25rem;
      font-size: 0.85rem;
      color: var(--mj-text-muted);
    }

    label.check {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--mj-text);
    }

    select,
    input[type='text'] {
      font: inherit;
      min-height: 44px;
      padding: 0 0.6rem;
      border-radius: 8px;
      border: 1px solid var(--mj-line);
      background: var(--mj-felt-edge);
      color: var(--mj-text);
    }

    .seats {
      display: grid;
      gap: 0.5rem;
      margin: 1rem 0;
    }

    .seat {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .seat-label {
      width: 5rem;
      font-size: 0.85rem;
      color: var(--mj-text-muted);
    }

    .host-note {
      font-size: 0.85rem;
      color: var(--mj-text-muted);
    }

    button {
      font: inherit;
      font-weight: 600;
      min-height: 44px;
      padding: 0 1.4rem;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid var(--mj-line);
      background: var(--mj-surface-raised);
      color: var(--mj-text);
    }

    button.primary {
      background: var(--mj-accent);
      border-color: var(--mj-accent);
      color: var(--mj-accent-ink);
    }

    .queue {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .hint,
    .notice {
      margin: 0.75rem 0 0;
      font-size: 0.85rem;
      color: var(--mj-text-muted);
    }

    .error {
      margin: 0.75rem 0 0;
      color: var(--mj-danger);
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
      }
    }
  `,
})
export class LobbyComponent {
  protected readonly lobby = inject(LobbyStore);
  protected readonly tables = inject(TableStore);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly seatIndices: readonly Seat[] = [0, 1, 2, 3];

  protected length: GameLength = 'hanchan';
  protected createLength: GameLength = 'hanchan';
  protected isPrivate = false;
  protected inviteCode = '';

  private readonly seats = signal<SeatQuartet>([...DEFAULT_SEATS] as SeatQuartet);

  /**
   * The payload, with the creator's chair kept open whatever else was configured.
   *
   * Forced here rather than trusted from the defaults: the seat the host sits in is not a
   * preference, and a table its creator cannot sit at is never what anybody asked for.
   */
  protected readonly seatConfigs = computed<SeatQuartet>(() => {
    const seats = [...this.seats()] as SeatQuartet;
    seats[HOST_SEAT] = { fill: 'open' };
    return seats;
  });

  constructor() {
    // Matchmaking finishes on its own schedule; the lobby follows it into the table it produced.
    effect(() => {
      const tableId = this.lobby.matchedTableId();
      if (tableId === null) return;
      this.lobby.consumeMatch();
      void this.router.navigate(['/table', tableId]);
    });
  }

  protected fillOf(seat: Seat): SeatFill {
    return this.seats()[seat].fill;
  }

  protected levelOf(seat: Seat): BotLevel {
    return this.seats()[seat].botLevel ?? 'normal';
  }

  protected setFill(seat: Seat, fill: SeatFill): void {
    this.seats.update((current) => {
      const next = [...current] as SeatQuartet;
      next[seat] = fill === 'bot' ? { fill, botLevel: this.levelOf(seat) } : { fill };
      return next;
    });
  }

  protected setLevel(seat: Seat, botLevel: BotLevel): void {
    this.seats.update((current) => {
      const next = [...current] as SeatQuartet;
      next[seat] = { fill: 'bot', botLevel };
      return next;
    });
  }

  protected async quickmatch(): Promise<void> {
    await this.lobby.quickmatch(this.length);
  }

  protected async cancel(): Promise<void> {
    await this.lobby.cancel();
  }

  protected async create(): Promise<void> {
    const tableId = await this.tables.create({
      length: this.createLength,
      seats: this.seatConfigs(),
      private: this.isPrivate,
    });
    if (tableId !== null) await this.router.navigate(['/table', tableId]);
  }

  protected async joinByCode(): Promise<void> {
    const code = this.inviteCode.trim();
    if (code.length === 0) return;
    const tableId = await this.tables.join({ inviteCode: code });
    if (tableId !== null) await this.router.navigate(['/table', tableId]);
  }
}
