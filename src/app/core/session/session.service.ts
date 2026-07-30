import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { SocketService } from '@core/socket/socket.service';

import { TableStore } from '@features/table/table.store';

/** Routes a reconnecting player may be pulled out of. Anywhere else, they chose to be there. */
const REDIRECTABLE = new Set(['/', '/lobby']);

/**
 * Boot: a session, a socket, and — if the server says the player is already sitting somewhere —
 * a redirect straight back into it.
 *
 * `docs/07-frontend.md` §2: *"A player who refreshes mid-hand lands back in their game without
 * touching the lobby."* The server volunteers `user:activeTable` on every handshake, so the client
 * never has to ask; what it has to do is not fight the player for the wheel, which is why the
 * redirect only fires from the landing page and the lobby.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly auth = inject(AuthService);
  private readonly socket = inject(SocketService);
  private readonly router = inject(Router);
  private readonly tables = inject(TableStore);

  private readonly _activeTableId = signal<string | null>(null);
  private readonly _ready = signal(false);
  private redirected = false;

  readonly activeTableId = this._activeTableId.asReadonly();
  /** True once the first session exists — the app can render before the socket connects. */
  readonly ready = this._ready.asReadonly();
  readonly user = this.auth.user;
  readonly isGuest = this.auth.isGuest;

  readonly connection = computed(() => this.socket.status());

  constructor() {
    this.socket.on('user:activeTable', (payload) => {
      this._activeTableId.set(payload.tableId);
      this.redirected = false;
    });

    // The table's status decides *which* screen: a game in progress is not a pre-game lobby.
    effect(() => {
      const tableId = this._activeTableId();
      const state = this.tables.state();
      if (tableId === null || state === null || state.tableId !== tableId) return;
      if (this.redirected) return;

      const url = this.router.url.split('?')[0] ?? '/';
      if (!REDIRECTABLE.has(url)) return;

      this.redirected = true;
      const target = state.status === 'in_progress' ? ['/game', tableId] : ['/table', tableId];
      void this.router.navigate(target);
    });
  }

  /**
   * Called once, from the app initializer. A guest is created on first visit so that the socket
   * has a token to hand over: M3's handshake authenticates before anything else, so "connect now,
   * authenticate later" is not a state the protocol has.
   */
  async bootstrap(): Promise<void> {
    try {
      const session = await this.auth.ensureSession();
      this.socket.setAccessToken(session?.accessToken ?? null);
    } catch {
      // No session: the socket will be refused and the landing page offers a retry. Blocking the
      // whole app on an unreachable auth service would show a blank page instead of an error.
    } finally {
      this._ready.set(true);
      this.socket.connect();
    }
  }

  /** After a login, register or upgrade: the socket must re-handshake with the new identity. */
  adoptNewToken(): void {
    this.socket.setAccessToken(this.auth.accessToken());
  }

  async signOut(): Promise<void> {
    await this.auth.logout();
    this._activeTableId.set(null);
    this.tables.clear();
    await this.auth.guest().catch(() => null);
    this.adoptNewToken();
    await this.router.navigate(['/']);
  }
}
