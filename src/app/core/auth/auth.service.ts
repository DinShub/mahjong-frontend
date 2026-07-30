import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AUTH_ROUTES } from '@contracts/auth';
import type {
  AuthErrorCode,
  AuthErrorResponse,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  UpgradeRequest,
} from '@contracts/auth';

import { APP_CONFIG } from '@core/config/app-config';

import { SESSION_STORE, isExpiring, sessionFromResponse } from './session-store';
import type { StoredSession } from './session-store';

/** A failed auth call, with the server's stable code where there was one. */
export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode | 'NETWORK',
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Everything that mints or spends a token.
 *
 * The socket handshake needs an access token before it can connect at all (`docs/05` §2), so the
 * app's very first act is {@link ensureSession}, which creates a guest if there is no session. That
 * is the "guest bootstrap on first visit" of the backlog: a visitor is a real account with a real
 * token from the first paint, and `POST /auth/upgrade` later turns it into a registered one
 * *without changing the user id*, so their game history survives signing up.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly store = inject(SESSION_STORE);

  private readonly _session = signal<StoredSession | null>(this.store.read());

  readonly session = this._session.asReadonly();
  readonly user = computed(() => this._session()?.user ?? null);
  readonly accessToken = computed(() => this._session()?.accessToken ?? null);
  readonly isAuthenticated = computed(() => this._session() !== null);
  readonly isGuest = computed(() => this._session()?.user.isGuest ?? true);
  readonly displayName = computed(() => this._session()?.user.displayName ?? null);

  /**
   * One refresh at a time. Four parallel requests hitting a 401 must not present the same
   * single-use refresh token four times — three of those look like token reuse to the server,
   * which revokes the whole family and logs the player out for being alive.
   */
  private inFlight: Promise<StoredSession | null> | null = null;

  /** A session, creating a guest if there is none. Safe to call repeatedly. */
  async ensureSession(): Promise<StoredSession | null> {
    const current = this._session();
    if (current === null) return this.guest();
    if (isExpiring(current, Date.now())) return this.refresh();
    return current;
  }

  async guest(): Promise<StoredSession> {
    return this.adopt(await this.post<AuthResponse>(AUTH_ROUTES.guest, {}));
  }

  async login(request: LoginRequest): Promise<StoredSession> {
    return this.adopt(await this.post<AuthResponse>(AUTH_ROUTES.login, request));
  }

  async register(request: RegisterRequest): Promise<StoredSession> {
    return this.adopt(await this.post<AuthResponse>(AUTH_ROUTES.register, request));
  }

  /** Convert the *current* guest. The server identifies it from the bearer token, not the body. */
  async upgrade(request: UpgradeRequest): Promise<StoredSession> {
    return this.adopt(await this.post<AuthResponse>(AUTH_ROUTES.upgrade, request));
  }

  /**
   * Rotate. Concurrent callers share one request; a failure clears the session, because a refresh
   * token the server will not honour cannot be made to work by asking again.
   */
  async refresh(): Promise<StoredSession | null> {
    const current = this._session();
    if (current === null) return null;

    this.inFlight ??= this.rotate(current.refreshToken).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async logout(): Promise<void> {
    const current = this._session();
    this.adopt(null);
    if (current === null) return;
    try {
      await this.post(AUTH_ROUTES.logout, { refreshToken: current.refreshToken });
    } catch {
      // Logging out is a local guarantee: the session is gone here whatever the server says.
    }
  }

  private async rotate(refreshToken: string): Promise<StoredSession | null> {
    try {
      return this.adopt(await this.post<AuthResponse>(AUTH_ROUTES.refresh, { refreshToken }));
    } catch {
      this.adopt(null);
      return null;
    }
  }

  private adopt(response: AuthResponse): StoredSession;
  private adopt(response: null): null;
  private adopt(response: AuthResponse | null): StoredSession | null {
    const session = response === null ? null : sessionFromResponse(response, Date.now());
    this.store.write(session);
    this._session.set(session);
    return session;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    try {
      return await firstValueFrom(this.http.post<T>(`${this.config.apiUrl}${path}`, body));
    } catch (error) {
      throw toAuthError(error);
    }
  }
}

function toAuthError(error: unknown): AuthError {
  if (!(error instanceof HttpErrorResponse)) {
    return new AuthError('NETWORK', error instanceof Error ? error.message : 'request failed');
  }
  const body = error.error as Partial<AuthErrorResponse> | null;
  if (typeof body?.code === 'string') {
    return new AuthError(body.code, body.message ?? error.message);
  }
  return new AuthError('NETWORK', error.status === 0 ? 'the server is unreachable' : error.message);
}
