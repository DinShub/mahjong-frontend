import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';

import { authInterceptor } from '@core/auth/auth.interceptor';
import { APP_CONFIG, buildAppConfig } from '@core/config/app-config';
import { SessionService } from '@core/session/session.service';
import { SettingsService } from '@core/settings/settings.service';

import { TileSpriteService } from '@shared/tiles/tile-sprite.service';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: APP_CONFIG, useFactory: () => buildAppConfig() },
    provideAppInitializer(() => {
      // Constructing the settings service here is what applies the stored theme before first paint.
      inject(SettingsService);
      // Start the tile sheet on its way at boot rather than when the board mounts: it is a separate
      // request, and the lobby is a good few seconds of head start. Not awaited — a board that
      // renders before its art is a board with tiles a moment later, and blocking the app on an
      // image is worse.
      inject(TileSpriteService).install();
      return inject(SessionService).bootstrap();
    }),
  ],
};
