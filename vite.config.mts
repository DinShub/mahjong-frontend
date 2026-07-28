/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';

import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/');

/** Mirrors the `paths` in tsconfig.json — vitest does not read them. */
const alias = {
  '@core': `${root}src/app/core`,
  '@features': `${root}src/app/features`,
  '@shared': `${root}src/app/shared`,
  '@contracts': `${root}src/app/core/contracts`,
  '@env': `${root}src/environments/environment.ts`,
};

export default defineConfig({
  plugins: [angular()],
  resolve: { alias },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/app/**/*.ts'],
      // core/contracts is generated and already covered by the backend's suite.
      exclude: ['src/app/core/contracts/**', 'src/app/**/*.spec.ts', 'src/app/**/index.ts'],
    },
  },
});
