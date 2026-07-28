import type { Routes } from '@angular/router';

/**
 * Route-level lazy loading throughout (`docs/07-frontend.md` §2). The lobby, table, game, replay
 * and profile routes arrive with M4/M5; `game` and `replay` will share the render-layer chunk.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('@features/landing/landing.component').then((m) => m.LandingComponent),
  },
  { path: '**', redirectTo: '' },
];
