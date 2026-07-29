/**
 * The HTTP auth contract.
 *
 * Spec: `docs/06-backend.md` §2 (`auth`).
 *
 * **[M3 addition]** — `contracts/` was described as *"socket event names + payload types"*, and
 * everything in it until now was the socket protocol. The REST auth surface belongs here for the
 * same reason the socket one does: `docs/02-architecture.md` makes this folder the source of truth
 * for *"the FE/BE contract"*, and a request shape the frontend re-declares by hand is a shape that
 * drifts. These types cost the folder nothing — they add no dependency and no coupling — and they
 * mean M4's auth interceptor is written against the server's own declarations.
 *
 * Every response below is what the *client* is allowed to see. `passwordHash`, `tokenVersion` and
 * the refresh-token family id appear in none of them.
 */

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** Converts the *caller's* guest account, identified by the bearer token, not by an id in the body. */
export interface UpgradeRequest {
  email: string;
  password: string;
  /** Keep the generated `Guest-1234` if omitted. */
  displayName?: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  /** Optional: logging out with no token still succeeds, so a client can always clear its state. */
  refreshToken?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  displayName: string;
  /** `null` for a guest. */
  email: string | null;
  isGuest: boolean;
  avatarId: string;
}

export interface AuthTokens {
  /** 15-minute JWT; sent in `Authorization: Bearer` and in the socket handshake. */
  accessToken: string;
  /** 60-day rotating token. Single-use: presenting a rotated one revokes the whole family. */
  refreshToken: string;
  /** Seconds until `accessToken` expires — refresh ahead of it, do not wait for a 401. */
  expiresIn: number;
}

export interface AuthResponse extends AuthTokens {
  user: AuthUser;
}

/** The body of a failed auth request. `code` is stable and safe to branch on. */
export interface AuthErrorResponse {
  code: AuthErrorCode;
  message: string;
}

export const AUTH_ERROR_CODES = [
  'INVALID_CREDENTIALS',
  'DISPLAY_NAME_TAKEN',
  'EMAIL_TAKEN',
  'WEAK_PASSWORD',
  'INVALID_DISPLAY_NAME',
  'NOT_A_GUEST',
  'ACCOUNT_DISABLED',
  'BAD_REQUEST',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/** Route paths, so the client never spells one out. */
export const AUTH_ROUTES = {
  guest: '/auth/guest',
  register: '/auth/register',
  login: '/auth/login',
  refresh: '/auth/refresh',
  upgrade: '/auth/upgrade',
  logout: '/auth/logout',
  password: '/auth/password',
} as const;
