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
      exclude: [
        'src/app/core/contracts/**',
        'src/app/**/*.spec.ts',
        'src/app/**/index.ts',
        // Test-only: the loader for the fixtures synced from the backend.
        'src/app/features/game/state/fixtures.ts',
      ],
      /**
       * A global floor, and a high bar on the parts that would be wrong *silently*.
       *
       * The screens are covered by Playwright, which is the right level for them: a component
       * test that a board renders four seat zones proves less than a browser playing a hand. What
       * unit tests are for here is the logic a screenshot cannot check — the event fold, the
       * pacing queue, which tile of a meld is rotated, and which of `prompt.options` becomes a
       * button. Those are held to 90%.
       */
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 60,
        lines: 70,
        'src/app/features/game/state/**': {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        'src/app/features/game/render/meld-layout.ts': {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90,
        },
        'src/app/features/game/input/action-slots.ts': {
          statements: 90,
          branches: 75,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
