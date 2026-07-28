import { InjectionToken } from '@angular/core';

import { PROTOCOL_VERSION } from '@contracts/protocol';

import { environment } from '@env';

/** The only values that differ between environments. */
export interface AppEnvironment {
  production: boolean;
  /** REST base URL. Empty string = same origin. */
  apiUrl: string;
  /** Socket.IO endpoint. Empty string = same origin. */
  socketUrl: string;
}

export interface AppConfig extends AppEnvironment {
  /** From the synced contract, never from the environment — the wire version is not deployable config. */
  readonly protocolVersion: number;
  readonly reconnect: {
    readonly initialDelayMs: number;
    readonly maxDelayMs: number;
    /** `Infinity` keeps trying; the UI shows the reconnecting state throughout. */
    readonly maxAttempts: number;
  };
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

export function buildAppConfig(env: AppEnvironment = environment): AppConfig {
  return {
    ...env,
    protocolVersion: PROTOCOL_VERSION,
    reconnect: {
      initialDelayMs: 500,
      maxDelayMs: 5_000,
      maxAttempts: Number.POSITIVE_INFINITY,
    },
  };
}

/** Resolve a configured URL against the current origin. */
export function resolveUrl(base: string, origin: string): string {
  return base.length > 0 ? base : origin;
}
