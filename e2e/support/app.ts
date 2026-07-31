import { expect } from '@playwright/test';
import type { APIRequestContext, Locator, Page } from '@playwright/test';

export const MOCK_URL = 'http://127.0.0.1:3100';

/**
 * Helpers for driving the client the way a player does.
 *
 * Everything here goes through the interface — no reaching into the store, no seeding state. If a
 * flow cannot be reached by clicking, the client has a hole in it, and a test that reaches around
 * the hole hides it.
 */

/** Which recorded hand the mock replays next, and how far into it to go. */
export interface FixtureOptions {
  /** Freeze the replay at this step, for a board that is not moving. */
  stopAt?: number;
  /** Follow the last step with `game:ended`. A fixture is one hand, so this is off by default. */
  endGame?: boolean;
}

export async function useFixture(
  request: APIRequestContext,
  name: string,
  options: FixtureOptions = {},
): Promise<void> {
  const response = await request.post(`${MOCK_URL}/control/fixture`, {
    data: { name, ...options },
  });
  expect(response.ok(), `unknown fixture ${name}`).toBe(true);
}

export async function enterLobby(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('connection-label')).toHaveText('Connected');
  await page.getByTestId('play-guest').click();
  await expect(page).toHaveURL(/\/lobby$/);
}

/** Landing → lobby → a table of one human and three bots → the board. */
export async function startGame(page: Page): Promise<void> {
  await enterLobby(page);
  await page.getByTestId('create-table').click();
  await expect(page).toHaveURL(/\/table\//);

  // The Ready button belongs to a seat, so its presence is the assertion that we have one. A
  // create that leaves its author unseated used to get this far and no further.
  await expect(page.getByTestId('toggle-ready')).toBeVisible();
  await expect(page.getByTestId('not-seated')).toHaveCount(0);

  await page.getByTestId('toggle-ready').click();
  await expect(page).toHaveURL(/\/game\//, { timeout: 15_000 });
  // Landscape and portrait are different modules; either one means the board is up.
  await expect(board(page)).toBeVisible();
}

/** The board, in whichever layout the viewport asked for. */
export function board(page: Page): Locator {
  return page.locator('[data-testid="board"], [data-testid="board-portrait"]');
}

/**
 * Tiles in your own hand the current prompt allows you to discard.
 *
 * `role="button"` is the discriminator, not the absence of `aria-disabled`: a tile with no prompt
 * outstanding is an `img` and carries no disabled state at all, so a `:not([aria-disabled])`
 * selector matches the whole hand between turns and a loop built on it spins clicking nothing.
 */
export function selectableTiles(page: Page): Locator {
  // `mj-hand` rather than a seat-specific test id: the portrait layout is a different module with
  // different ids, and every one of these tests should hold on a phone as well as a desktop.
  return page.locator('mj-hand [role="button"]:not([aria-disabled="true"])');
}

/** Your own pond, in either layout. */
export function myPond(page: Page): Locator {
  return page.locator('[data-testid*="pond-bottom-tile-"]');
}

/**
 * Anything the current prompt lets the player touch.
 *
 * Waiting on *this* rather than on the countdown matters: the client clears a prompt optimistically
 * the moment it is answered, so the timer can still be on screen for a frame after there is
 * nothing left to click. A test that waits on the timer answers a prompt that has gone.
 */
export function actionable(page: Page): Locator {
  return page.locator(
    'button.action:not(.empty), mj-hand [role="button"]:not([aria-disabled="true"])',
  );
}

/** Wait until the server is asking this seat for something. */
export async function awaitPrompt(page: Page, timeout = 20_000): Promise<void> {
  await expect(actionable(page).first()).toBeVisible({ timeout });
}

/**
 * Answer whatever is being asked, the way a player would: decline a call if declining is offered,
 * otherwise discard the first tile the prompt allows.
 */
export async function answerPrompt(page: Page): Promise<void> {
  await awaitPrompt(page, 6_000);

  const pass = page.getByTestId('action-pass');
  if (await pass.isVisible()) {
    await pass.click();
    return;
  }

  const tile = selectableTiles(page).first();
  if (await tile.isVisible()) {
    // Select, then confirm — the default two-click discard.
    await tile.click();
    await tile.click();
    return;
  }

  // Neither: some other decision (a win, a kan). Take the first button on offer.
  const button = page.locator('button.action:not(.empty)').first();
  if (!(await button.isVisible())) return;
  await button.click();
  const variant = page.getByTestId('variant-0');
  if (await variant.isVisible()) await variant.click();
}

/** Keep answering until `target` shows up, or `maxPrompts` decisions have gone by. */
export async function playUntil(page: Page, target: Locator, maxPrompts = 30): Promise<void> {
  for (let index = 0; index < maxPrompts; index += 1) {
    if (await target.first().isVisible()) return;
    try {
      await answerPrompt(page);
    } catch {
      // Nothing to answer just now — the other three seats are playing.
    }
  }
}

/** Play until a result overlay appears, or until `maxPrompts` decisions have been answered. */
export async function playToResult(page: Page, maxPrompts = 40): Promise<void> {
  const overlay = page.locator(
    '[data-testid="agari-overlay"], [data-testid="ryuukyoku-overlay"], [data-testid="game-end-overlay"]',
  );

  await playUntil(page, overlay, maxPrompts);
  await expect(overlay.first()).toBeVisible({ timeout: 20_000 });
}

/** Make the mock push a `game:waits`. See `/control/waits` in the mock server. */
export async function pushWaits(
  request: APIRequestContext,
  waits: { tiles: string[]; inMyDiscards?: string[]; furiten?: boolean },
): Promise<void> {
  const response = await request.post(`${MOCK_URL}/control/waits`, { data: waits });
  expect(response.ok()).toBe(true);
}
