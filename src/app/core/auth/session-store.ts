import { InjectionToken } from '@angular/core';

import type { AuthResponse, AuthUser } from '@contracts/auth';

/**
 * Where the session lives between page loads.
 *
 * `localStorage` and not a cookie: the access token is sent in the socket handshake and in an
 * `Authorization` header, never automatically by the browser, so there is nothing for a cookie to
 * buy — and a `httpOnly` cookie the JS cannot read could not be put in the handshake at all.
 */
export const SESSION_STORAGE_KEY = 'mj.session.v1';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** Local epoch ms, derived from `expiresIn` when the response landed. */
  expiresAt: number;
  user: AuthUser;
}

/** Just enough of `Storage` to be swapped in a test — or to fall back to memory. */
export interface SessionStore {
  read(): StoredSession | null;
  write(session: StoredSession | null): void;
}

/** `expiresIn` is seconds from now; refresh this far ahead of it rather than waiting for a 401. */
export const REFRESH_MARGIN_MS = 60_000;

export function sessionFromResponse(response: AuthResponse, now: number): StoredSession {
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: now + response.expiresIn * 1000,
    user: response.user,
  };
}

export function isExpiring(session: StoredSession, now: number): boolean {
  return session.expiresAt - now <= REFRESH_MARGIN_MS;
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredSession>;
  return (
    typeof candidate.accessToken === 'string' &&
    typeof candidate.refreshToken === 'string' &&
    typeof candidate.expiresAt === 'number' &&
    typeof candidate.user === 'object' &&
    candidate.user !== null &&
    typeof (candidate.user as AuthUser).id === 'string'
  );
}

/**
 * A store that survives a reload, degrading to memory when it cannot.
 *
 * Safari's private mode and a locked-down enterprise profile both make `localStorage` throw on
 * write; a game that refuses to start because the browser will not remember a guest token is worse
 * than one that forgets it on reload.
 */
export function createSessionStore(storage: Storage | null = safeLocalStorage()): SessionStore {
  let memory: StoredSession | null = null;

  return {
    read(): StoredSession | null {
      if (storage === null) return memory;
      try {
        const raw = storage.getItem(SESSION_STORAGE_KEY);
        if (raw === null) return null;
        const parsed: unknown = JSON.parse(raw);
        return isStoredSession(parsed) ? parsed : null;
      } catch {
        // A corrupt entry is indistinguishable from no entry, and both mean "log in again".
        return null;
      }
    },
    write(session: StoredSession | null): void {
      memory = session;
      if (storage === null) return;
      try {
        if (session === null) storage.removeItem(SESSION_STORAGE_KEY);
        else storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } catch {
        // Memory already holds it; the session simply will not survive a reload.
      }
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const SESSION_STORE = new InjectionToken<SessionStore>('SESSION_STORE', {
  providedIn: 'root',
  factory: () => createSessionStore(),
});
