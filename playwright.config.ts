import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated ports, never the app's own :4200/:3000, and `reuseExistingServer: false` throughout.
 * Reusing whatever happens to be listening means an unrelated project on the same port gets tested
 * instead — which is exactly as confusing as it sounds. The app under test is built with
 * `--configuration e2e`, whose environment points at the mock below.
 */
const APP_PORT = 4300;
const MOCK_PORT = 3100;
const APP_URL = `http://localhost:${APP_PORT}`;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

/**
 * E2E against a mock socket server, never against the real backend: the repos are independent and
 * a client bug must be diagnosable without standing up a database.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: APP_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mobile is a first-class target (docs/08-graphics-ux.md §2); the portrait layout lands in M4.
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],

  webServer: [
    {
      command: 'node e2e/support/mock-socket-server.mjs',
      env: { MOCK_PORT: String(MOCK_PORT) },
      url: `${MOCK_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npm run start -- --configuration e2e --port ${APP_PORT}`,
      url: APP_URL,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
