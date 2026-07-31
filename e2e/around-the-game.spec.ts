import { expect, test } from '@playwright/test';

import { enterLobby } from './support/app';

/**
 * M5's screens: profile, history, replay, settings.
 *
 * The load-bearing test in here is **"verifies the wall against the seed it was dealt from"**. The
 * replay it opens is `test-fixtures/replay.json` — a whole game the backend engine actually played,
 * synced from `dist-fixtures/` and drift-checked in both CIs — and the button re-derives 136 tiles
 * per hand in the browser from the published seed. It passes only if the client's PRNG, its
 * seeding, its shuffle and its deal order all agree with the server's, through the real fetch, the
 * real zod validation and the real component. That is the commit-reveal promise of
 * `docs/11-nonfunctional.md` §1, checked end to end rather than asserted.
 */

const FINISHED_GAME = '000000000000000000000000';
/** The id the mock refuses, standing in for a game still being played. */
const LIVE_GAME = 'aaaaaaaaaaaaaaaaaaaaaaaa';

test.describe('profile', () => {
  test('is reachable from the lobby and shows the stats the docs name', async ({ page }) => {
    await enterLobby(page);
    await page.getByTestId('nav-profile').click();
    await expect(page).toHaveURL(/\/profile$/);

    await expect(page.getByTestId('profile-name')).toHaveText('Kaori');

    // `docs/09-database.md`: "placement distribution, win rate, deal-in rate, riichi rate, call
    // rate. Anything else is decoration."
    await expect(page.getByTestId('placement-bars')).toBeVisible();
    await expect(page.getByTestId('placement-1')).toContainText('50%');
    await expect(page.getByTestId('placement-4')).toContainText('0%');
    await expect(page.getByTestId('avg-placement')).toContainText('1.75');
    await expect(page.getByTestId('metric-win')).toContainText('25.0%');
    await expect(page.getByTestId('metric-dealin')).toContainText('12.5%');
    await expect(page.getByTestId('metric-riichi')).toContainText('31.3%');
    await expect(page.getByTestId('metric-call')).toContainText('18.8%');
  });

  test('lists the yaku a player wins with, in the naming they chose', async ({ page }) => {
    await enterLobby(page);
    await page.goto('/profile');
    await expect(page.getByTestId('profile-yaku')).toContainText('riichi');
    await expect(page.getByTestId('profile-yakuman')).toContainText('1 yakuman');

    await page.goto('/settings');
    await page.getByTestId('yaku-english').click();
    await page.goto('/profile');
    await expect(page.getByTestId('profile-yaku')).toContainText('Ready hand');
    await expect(page.getByTestId('profile-yaku')).not.toContainText('riichi');
  });

  test('pages the history rather than loading all of it', async ({ page }) => {
    await enterLobby(page);
    await page.goto('/profile');

    const rows = page.getByTestId('game-history').locator('li');
    await expect(rows).toHaveCount(2);

    await page.getByTestId('load-more').click();
    await expect(rows).toHaveCount(3);
    // The cursor is exhausted, so the button goes away rather than fetching the same page forever.
    await expect(page.getByTestId('load-more')).toHaveCount(0);
  });

  test('links each finished game to its replay', async ({ page }) => {
    await enterLobby(page);
    await page.goto('/profile');
    await page.getByTestId(`replay-link-${FINISHED_GAME}`).click();
    await expect(page).toHaveURL(new RegExp(`/replay/${FINISHED_GAME}$`));
    await expect(page.getByTestId('replay-transport')).toBeVisible();
  });
});

test.describe('replay', () => {
  test('refuses a game that is still being played', async ({ page }) => {
    // The rule `docs/09-database.md` sets in bold, seen from the client: a refusal a player can
    // read, not a broken board.
    await page.goto(`/replay/${LIVE_GAME}`);
    await expect(page.getByTestId('replay-error')).toContainText('still being played');
    await expect(page.getByTestId('replay-transport')).toHaveCount(0);
  });

  test('steps, seeks by hand and scrubs', async ({ page }) => {
    await page.goto(`/replay/${FINISHED_GAME}`);
    await expect(page.getByTestId('replay-transport')).toBeVisible();
    await expect(page.getByTestId('replay-position')).toContainText('0/');

    await page.getByTestId('replay-step').click();
    await expect(page.getByTestId('replay-position')).toContainText('1/');

    // Seeking by hand jumps to a `hand-start`, so the label changes with it.
    await expect(page.getByTestId('replay-position')).toContainText('East 1');
    await page.getByTestId('replay-next-hand').click();
    await expect(page.getByTestId('replay-position')).toContainText('East 2');

    await page.getByTestId('replay-prev-hand').click();
    await expect(page.getByTestId('replay-position')).toContainText('East 1');
  });

  test('plays, and plays faster when asked to', async ({ page }) => {
    await page.goto(`/replay/${FINISHED_GAME}`);
    await page.getByTestId('replay-speed-4').click();
    await page.getByTestId('replay-play').click();
    await expect(page.getByTestId('replay-play')).toHaveAttribute('aria-pressed', 'true');

    // At 4× an event lands every 175 ms, so a second is several of them.
    await expect(page.getByTestId('replay-position')).not.toContainText('0/', { timeout: 5_000 });
    await page.getByTestId('replay-play').click();
    await expect(page.getByTestId('replay-play')).toHaveAttribute('aria-pressed', 'false');
  });

  test('switches seats and reveals every hand', async ({ page }) => {
    await page.goto(`/replay/${FINISHED_GAME}`);
    await page.getByTestId('replay-step').click();
    // Wait on the render, not on the click: `count()` does not auto-retry, so counting straight
    // after a click reads the board as it was before the fold re-ran.
    await expect(page.getByTestId('replay-position')).toContainText('1/');

    // Seat 0's own hand is face up; the other three are backs. `mj-tile` carries `data-tile="back"`
    // for a concealed tile, so counting the ones that are *not* backs is what "revealed" means.
    const faces = page.locator('mj-hand [data-tile]:not([data-tile="back"])');
    await expect(faces).toHaveCount(13);
    const asSeat = 13;

    await page.getByTestId('replay-seat-all').click();
    await expect(page.getByTestId('replay-seat-all')).toHaveAttribute('aria-pressed', 'true');
    // Four hands face up rather than one.
    await expect(faces).not.toHaveCount(asSeat);
    expect(await faces.count()).toBeGreaterThan(asSeat);
  });

  test('verifies the wall against the seed it was dealt from', async ({ page }) => {
    await page.goto(`/replay/${FINISHED_GAME}`);
    await page.getByTestId('replay-verify').click();

    const verdict = page.getByTestId('replay-verdict');
    await expect(verdict).toBeVisible({ timeout: 20_000 });
    await expect(verdict).toContainText('Verified');
    await expect(verdict).toContainText('published before the game');
    await expect(verdict).not.toHaveClass(/bad/);
  });

  test('is keyboard-drivable', async ({ page }) => {
    await page.goto(`/replay/${FINISHED_GAME}`);
    await expect(page.getByTestId('replay-transport')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('replay-position')).toContainText('1/');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('replay-position')).toContainText('0/');
    await page.keyboard.press(']');
    await expect(page.getByTestId('replay-position')).toContainText('East 2');
  });
});

test.describe('settings', () => {
  test('changes the theme, and the change survives a reload', async ({ page }) => {
    await enterLobby(page);
    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL(/\/settings$/);

    await page.getByTestId('theme-dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true');
  });

  test('shows the yaku naming choice as the thing it changes', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('yaku-sample')).toContainText('riichi');
    await page.getByTestId('yaku-kanji').click();
    await expect(page.getByTestId('yaku-sample')).toContainText('立直');
    await page.getByTestId('yaku-english').click();
    await expect(page.getByTestId('yaku-sample')).toContainText('Ready hand');
  });

  test('has an honest voice slider', async ({ page }) => {
    await page.goto('/settings');
    // Open decision 8 ships silent, so the voice channel has nothing behind it and says so rather
    // than offering a volume control for silence.
    await expect(page.getByTestId('volume-voice')).toBeDisabled();
    await expect(page.getByTestId('voice-note')).toBeVisible();
    await expect(page.getByTestId('volume-sfx')).toBeEnabled();
  });

  test('switches the interface to Japanese and back', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.getByTestId('locale-ja').click();
    // The locale is installed before bootstrap, so this reloads — and the reloaded app is the one
    // that has to be in Japanese.
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.getByRole('heading', { name: '設定' })).toBeVisible();
    await expect(page.getByTestId('locale-ja')).toHaveAttribute('aria-checked', 'true');

    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: '着順' })).toBeVisible();

    await page.goto('/settings');
    await page.getByTestId('locale-en').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('resets everything back to the defaults', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('theme-dark').click();
    await page.getByTestId('yaku-kanji').click();
    await page.getByTestId('discard-one-click').click();

    await page.getByTestId('reset-settings').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic-green');
    await expect(page.getByTestId('yaku-romaji')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('discard-select-confirm')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
