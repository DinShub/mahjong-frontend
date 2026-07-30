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

test.describe.configure({ mode: 'serial' });

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
