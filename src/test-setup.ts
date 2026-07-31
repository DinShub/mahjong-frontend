import '@analogjs/vitest-angular/setup-zone';
// `i18n` attributes compile to `$localize` calls, so the polyfill the build lists in angular.json
// has to be installed here too — otherwise every component carrying translatable text fails to
// instantiate, which is a worse failure than an untranslated one.
import '@angular/localize/init';

import { webcrypto } from 'node:crypto';

import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { getTestBed } from '@angular/core/testing';

/**
 * jsdom ships no Web Crypto, and the seed verifier of `features/replay/verify-seed.ts` is built on
 * `crypto.subtle.digest`. Node's implementation is the same WebCrypto standard a browser exposes,
 * so this restores the platform rather than stubbing it — the SHA-256 the test checks against the
 * server's golden values is a real one.
 */
if (globalThis.crypto?.subtle === undefined) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
