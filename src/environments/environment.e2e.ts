import type { AppEnvironment } from '@core/config/app-config';

/**
 * Used by `ng serve --configuration e2e`, which the Playwright suite starts.
 *
 * It points at the mock socket server on a dedicated port rather than the backend's :3000, so the
 * e2e run cannot collide with a real backend — or with anything else on the developer's machine.
 */
export const environment: AppEnvironment = {
  production: false,
  apiUrl: 'http://127.0.0.1:3100',
  socketUrl: 'http://127.0.0.1:3100',
};
