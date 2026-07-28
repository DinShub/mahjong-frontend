import type { AppEnvironment } from '@core/config/app-config';

/**
 * Development environment. Replaced at build time by `environment.production.ts`
 * (see `fileReplacements` in angular.json) — nothing else in the app reads build flags.
 */
export const environment: AppEnvironment = {
  production: false,
  /** Backend REST base. Empty string means "same origin". */
  apiUrl: 'http://localhost:3000',
  /** Socket.IO endpoint. Empty string means "same origin". */
  socketUrl: 'http://localhost:3000',
};
