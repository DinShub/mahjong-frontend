import { inject } from '@angular/core';
import { Router } from '@angular/router';
import type { CanActivateFn, Routes } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';

/**
 * A seat is not something the client can verify — the server decides, and answers `NOT_SEATED` if
 * it disagrees. What this guard checks is the precondition for even asking: a session. Without one
 * the socket cannot handshake, so `/game/x` would render a permanently empty board.
 */
const requiresSession: CanActivateFn = () => {
  if (inject(AuthService).isAuthenticated()) return true;
  return inject(Router).createUrlTree(['/']);
};

/**
 * Route-level lazy loading throughout (`docs/07-frontend.md` §2). `game` and `replay` share the
 * render-layer chunk — the replay viewer imports `mj-board`, `mj-stage` and the two result
 * overlays from `features/game/`, which is what "the same render layer, fed from a fetched log"
 * means in build terms as well as in design ones.
 *
 * `/profile`, `/replay/:gameId` and `/settings` are **not** behind `requiresSession`. A profile and
 * a finished game's replay are public reads on the server (`docs/06-backend.md` §2), so guarding
 * them here would only stop someone opening a shared link — and `/settings` writes to
 * `localStorage`, which a visitor with no account has as much of as anyone.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('@features/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'lobby',
    canActivate: [requiresSession],
    loadComponent: () => import('@features/lobby/lobby.component').then((m) => m.LobbyComponent),
  },
  {
    path: 'table/:tableId',
    canActivate: [requiresSession],
    loadComponent: () => import('@features/table/table.component').then((m) => m.TableComponent),
  },
  {
    path: 'game/:tableId',
    canActivate: [requiresSession],
    loadComponent: () => import('@features/game/game.component').then((m) => m.GameComponent),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('@features/profile/profile.component').then((m) => m.ProfileComponent),
  },
  {
    // `:userId` is bound to the component's input by `withComponentInputBinding`; the route above
    // leaves it undefined, which the component reads as "me".
    path: 'profile/:userId',
    loadComponent: () =>
      import('@features/profile/profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: 'replay/:gameId',
    loadComponent: () => import('@features/replay/replay.component').then((m) => m.ReplayComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('@features/settings/settings.component').then((m) => m.SettingsComponent),
  },
  { path: '**', redirectTo: '' },
];
