import type { AppEnvironment } from '@core/config/app-config';

/**
 * Production environment.
 *
 * Both URLs are empty, i.e. same origin: the static bundle is served from a host that proxies
 * `/api` and the socket to the backend. A deployment that splits the two overrides these — they
 * are the only two values that vary between environments.
 */
export const environment: AppEnvironment = {
  production: true,
  apiUrl: '',
  socketUrl: '',
};
