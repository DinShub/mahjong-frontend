import { expect, test } from '@playwright/test';

import { startGame, useFixture } from './support/app';

/**
 * Screenshot diffs of the board at fixed states, at three viewports
 * (`docs/07-frontend.md` §9).
 *
 * Three things make this deterministic rather than flaky:
 *
 * - **The hand is frozen.** `stopAt` tells the mock to stop replaying at a known step, so the
 *   board is a still image rather than a game in progress.
 * - **Nothing animates.** The project runs with `reducedMotion: 'reduce'`, which the motion layer
 *   reads; state still applies, it just cuts.
 * - **The clock is masked.** A countdown and a timer ring are, by design, different every frame.
 *
 * Snapshots are per-platform — Playwright suffixes the file — because the UI text is drawn in the
 * platform's own font. That is deliberate: no webfont is shipped (see `ASSETS.md`).
 */

/**
 * Not `serial`.
 *
 * `playwright.config.ts` already sets `fullyParallel: false` and `workers: 1`, so these run one at
 * a time regardless — what `mode: 'serial'` added on top was *skip the rest of the file after the
 * first failure*, and for a screenshot suite that is the wrong trade. One stale baseline then hides
 * every other diff, so a change to shared chrome looks like a single failure and takes as many
 * pushes to clear as it has screens. It did exactly that when M5 added a nav to the lobby header:
 * the lobby diff reported, and the three new screens never ran at all.
 *
 * Each test here sets up whatever it needs (`useFixture`, its own viewport) before it starts, so
 * there is no state to carry between them.
 */
test.describe.configure({ mode: 'default' });

const MOVING_PARTS = ['[data-testid="deadline"]', '.ring'];

const VIEWPORTS = [
  { name: 'desktop', width: 1600, height: 900 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'phone', width: 390, height: 844 },
];

for (const viewport of VIEWPORTS) {
  test(`board at ${viewport.name}`, async ({ page, request }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    // Far enough in to have discards, melds and a couple of revealed indicators.
    await useFixture(request, 'suukaikan', { stopAt: 60 });
    await startGame(page);

    // The queue drains at its own pace after the socket goes quiet; wait for it to settle.
    await expect(page.getByTestId('centre-panel')).toBeVisible();
    await page.waitForTimeout(1_500);

    await expect(page).toHaveScreenshot(`board-${viewport.name}.png`, {
      mask: MOVING_PARTS.map((selector) => page.locator(selector)),
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });
}

test('agari overlay', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await useFixture(request, 'kyuushu_kyuuhai');
  await startGame(page);

  await expect(page.getByTestId('deadline')).toBeVisible({ timeout: 20_000 });
  const tile = page
    .locator('[data-testid^="seat-bottom-hand-"][role="button"]:not([aria-disabled="true"])')
    .first();
  await tile.click();
  await tile.click();

  await expect(page.getByTestId('ryuukyoku-overlay')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);

  await expect(page.getByTestId('ryuukyoku-overlay')).toHaveScreenshot('ryuukyoku-overlay.png', {
    maxDiffPixelRatio: 0.01,
    animations: 'disabled',
  });
});

test('lobby', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.getByTestId('connection-label')).toHaveText('Connected');
  await page.getByTestId('play-guest').click();
  await expect(page).toHaveURL(/\/lobby$/);

  await expect(page).toHaveScreenshot('lobby.png', {
    // The generated guest name differs per run.
    mask: [page.getByTestId('lobby-user')],
    maxDiffPixelRatio: 0.01,
    animations: 'disabled',
  });
});

/**
 * M5's screens.
 *
 * The replay is snapshotted at a fixed cursor with a fixed fixture, so it is as still as the board
 * shots above without needing the mock's `stopAt` — the transport bar is the freeze control.
 */
test('profile', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/profile');
  await expect(page.getByTestId('placement-bars')).toBeVisible();

  await expect(page).toHaveScreenshot('profile.png', {
    maxDiffPixelRatio: 0.01,
    animations: 'disabled',
  });
});

test('replay viewer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/replay/000000000000000000000000');
  await expect(page.getByTestId('replay-transport')).toBeVisible();
  // A few events in: hands dealt, a discard or two on the table.
  for (let step = 0; step < 6; step += 1) await page.getByTestId('replay-step').click();
  await expect(page.getByTestId('replay-position')).toContainText('6/');

  await expect(page).toHaveScreenshot('replay.png', {
    maxDiffPixelRatio: 0.01,
    animations: 'disabled',
  });
});

test('settings', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/settings');
  await expect(page.getByTestId('theme-dark')).toBeVisible();

  await expect(page).toHaveScreenshot('settings.png', {
    maxDiffPixelRatio: 0.01,
    animations: 'disabled',
  });
});
