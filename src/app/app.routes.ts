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
 * render-layer chunk; the replay and profile routes arrive with M5.
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
  { path: '**', redirectTo: '' },
];
