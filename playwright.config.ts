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
 * a client bug must be diagnosable without standing up a database. The mock replays the backend's
 * own recorded games (`test-fixtures/`, synced from `backend/dist-fixtures/`).
 *
 * **One worker.** The mock holds a single selected fixture and a single replay, so parallel tests
 * would be picking each other's hands. Making it multi-tenant would buy a few seconds of wall
 * clock and cost the thing that makes the suite readable: each test names the hand it plays.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  // A recorded hand is a couple of hundred paced events plus a decision every few of them.
  timeout: 150_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: APP_URL,
    // Playwright's default is "wait forever". A click with nothing under it should fail the test
    // it is in, not consume the whole suite's budget.
    actionTimeout: 15_000,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    // The motion layer reads this; with it on, animations are skipped and state cuts instead.
    contextOptions: { reducedMotion: 'reduce' },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/visual.spec.ts',
    },
    // Mobile is a first-class target (docs/08-graphics-ux.md §2): the portrait layout is a
    // separate module, so it needs its own run rather than a narrower desktop one.
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testIgnore: '**/visual.spec.ts',
    },
    {
      name: 'visual',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/visual.spec.ts',
    },
  ],

  webServer: [
    {
      command: 'node e2e/support/mock-socket-server.mjs',
      env: {
        MOCK_PORT: String(MOCK_PORT),
        ...(process.env['MOCK_DEBUG'] ? { MOCK_DEBUG: '1' } : {}),
      },
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
