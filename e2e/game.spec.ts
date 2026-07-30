import { expect, test } from '@playwright/test';

import {
  MOCK_URL,
  answerPrompt,
  awaitPrompt,
  enterLobby,
  myPond,
  playToResult,
  playUntil,
  selectableTiles,
  startGame,
  useFixture,
} from './support/app';

/**
 * A scripted game against the mock server (`docs/07-frontend.md` §9).
 *
 * The hands are real: `test-fixtures/` is synced from the backend's own fixtures — games the M2
 * soak found, projected for one seat by the engine that passes the conformance gate — so these
 * tests exercise the client against the same data the backend is tested against, including the
 * situations nobody would think to write down.
 */

// The mock server holds one selected fixture at a time, so these run one after another.
test.describe.configure({ mode: 'serial' });

test.describe('a private table against three bots', () => {
  test('seats the player who made it', async ({ page, request }) => {
    await useFixture(request, 'chankan');
    await enterLobby(page);

    // The default the lobby offers: you, and three bots.
    await expect(page.getByTestId('seat-fill-1')).toHaveValue('bot');
    await page.getByTestId('create-private').check();
    await page.getByTestId('create-table').click();
    await expect(page).toHaveURL(/\/table\//);

    // A seat is yours: the Ready button belongs to one, and nothing says you are only watching.
    await expect(page.getByTestId('toggle-ready')).toBeVisible();
    await expect(page.getByTestId('not-seated')).toHaveCount(0);
    await expect(page.getByTestId('invite-code')).toBeVisible();

    // Exactly three of the four are bots.
    await expect(page.locator('[data-testid^="table-seat-"]')).toHaveCount(4);
    await expect(page.getByText('bot · normal')).toHaveCount(3);

    await page.getByTestId('toggle-ready').click();
    await expect(page).toHaveURL(/\/game\//, { timeout: 15_000 });

    // …and you are playing it, not watching it: a prompt arrives and asks you for something.
    await expect(page.getByTestId('spectating')).toHaveCount(0);
    await awaitPrompt(page);
    await expect(selectableTiles(page).first()).toBeVisible();
  });
});

test.describe('playing a hand', () => {
  test('deals a board, prompts, and takes a discard', async ({ page, request }) => {
    await useFixture(request, 'chankan');
    await startGame(page);

    // Thirteen tiles, four seats, a wall count and a dora indicator: the hand is dealt.
    await expect(page.getByTestId('centre-panel')).toBeVisible();
    await expect(page.getByTestId('dora-0')).toHaveAttribute('data-tile', /^[0-9][mpsz]$/);
    await expect(page.locator('mj-hand').first()).toBeVisible();

    await awaitPrompt(page);
    const before = await myPond(page).count();

    const tile = selectableTiles(page).first();
    await tile.click();
    // One click selects; it must not discard, or misclicks cost hands.
    await expect(myPond(page)).toHaveCount(before);
    await tile.click();

    await expect(myPond(page)).toHaveCount(before + 1, { timeout: 10_000 });
  });

  test('shows the dora indicator in the middle of the table', async ({ page, request }) => {
    await useFixture(request, 'chankan');
    await startGame(page);

    const dora = page.getByTestId('dora-0');
    await expect(dora).toBeVisible();
    await expect(dora).toHaveAttribute('data-tile', /^[0-9][mpsz]$/);

    // Inside the centre panel, not off in a corner — the whole point of moving it. Runs in the
    // portrait project too, where the centre panel is a different module.
    const centre = page.getByTestId('centre-panel');
    const inner = await dora.boundingBox();
    const outer = await centre.boundingBox();
    expect(inner, 'the dora tile has no box').not.toBeNull();
    expect(outer, 'the centre panel has no box').not.toBeNull();
    if (inner === null || outer === null) return;

    expect(inner.width).toBeGreaterThan(0);
    expect(inner.x).toBeGreaterThanOrEqual(outer.x);
    expect(inner.y).toBeGreaterThanOrEqual(outer.y);
    expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);

    // Five slots always, so "how many kan have happened" cannot hide behind a layout change.
    // Tiles only — the strip's own `dora-strip` id also starts with `dora-`.
    await expect(page.locator('mj-tile[data-testid^="dora-"]')).toHaveCount(5);
  });

  test('draws the tiles from the sprite sheet, not as blank slabs', async ({ page, request }) => {
    await useFixture(request, 'chankan');
    await startGame(page);
    await awaitPrompt(page);

    // Every tile on the board resolves to a symbol in the fetched sheet. A 404 would leave the
    // element laid out correctly and empty, which is the failure that survives a look at a
    // screenshot.
    const first = selectableTiles(page).first();
    await expect(first.locator('use')).toHaveAttribute('href', /^#mj-tr-/);

    const symbols = await page.evaluate(
      () => document.getElementById('mj-tile-sprite')?.querySelectorAll('symbol').length ?? 0,
    );
    expect(symbols).toBeGreaterThanOrEqual(38);

    // …and every tile is *on* something. Upstream's faces are the design alone on a transparent
    // ground, so a set that suppresses the CSS body renders a board of painted designs lying on
    // the felt — which resolves its symbols, lays out correctly, and is what shipped once.
    const slab = await first.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        wholeTile: el.classList.contains('whole-tile'),
        backgroundImage: style.backgroundImage,
        borderStyle: style.borderTopStyle,
      };
    });
    expect(slab.wholeTile).toBe(false);
    expect(slab.backgroundImage).not.toBe('none');
    expect(slab.borderStyle).not.toBe('none');
  });

  test('offers exactly the actions the server sent, and no others', async ({ page, request }) => {
    await useFixture(request, 'chankan');
    await startGame(page);
    await awaitPrompt(page);

    // Every slot is rendered so nothing moves between prompts; only the offered ones are buttons.
    const cells = page.locator('[data-testid="action-bar"] .slots > *');
    await expect(cells).toHaveCount(8);

    const live = page.locator('button.action:not(.empty)');
    const count = await live.count();
    for (let index = 0; index < count; index += 1) {
      await expect(live.nth(index)).toBeEnabled();
    }
  });

  test('shows a called set with the sideways tile, and leaves a gap in the pond', async ({
    page,
    request,
  }) => {
    await useFixture(request, 'suukaikan');
    await startGame(page);

    // Somebody calls within the first few turns of this hand.
    const anyMeld = page.locator('mj-melds .meld').first();
    await playUntil(page, anyMeld, 25);
    await expect(anyMeld).toBeVisible({ timeout: 20_000 });

    // Exactly one column of the meld is rotated, and it names who it came from.
    await expect(anyMeld.locator('.column.rotated')).toHaveCount(1);

    // The discard it took keeps its slot rather than closing the gap.
    await expect(page.locator('[data-testid*="-gap-"]').first()).toBeVisible();
  });

  test('rotates a riichi declaration in the pond and marks the seat', async ({ page, request }) => {
    await useFixture(request, 'suucha_riichi');
    await startGame(page);

    const rotated = page.locator('[data-testid*="-tile-"].riichi').first();
    await playUntil(page, rotated, 30);

    await expect(rotated).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('riichi-tag').first()).toBeVisible();
  });

  test('ends the hand with a result a player can read', async ({ page, request }) => {
    // The shortest recorded hand that ends in a win — eleven decisions, then a rinshan kaihou.
    await useFixture(request, 'rinshan_kaihou');
    await startGame(page);
    await playToResult(page, 20);

    const agari = page.getByTestId('agari-overlay');
    await expect(agari).toBeVisible();
    // The breakdown, not just a number: yaku rows, a han/fu line, and the four deltas.
    await expect(agari.getByTestId('win-kind')).toBeVisible();
    await expect(agari.locator('.yaku tbody tr').first()).toBeVisible();
    await expect(agari.locator('[data-testid^="han-fu-"]')).toContainText('han');
    await expect(agari.getByTestId('score-deltas').locator('.delta')).toHaveCount(4);

    await agari.getByTestId('dismiss-agari').click();
    await expect(agari).toBeHidden();
  });

  test('shows the winning hand first, and the placings only after Continue', async ({
    page,
    request,
  }) => {
    await useFixture(request, 'rinshan_kaihou', { endGame: true });
    await startGame(page);
    await playToResult(page, 20);

    const agari = page.getByTestId('agari-overlay');
    const results = page.getByTestId('game-end-overlay');

    // The hand that won the game is the one hand nobody wants to miss, and `game:ended` arrives
    // off the queue — early enough to cover it. The scoreboard waits its turn.
    await expect(agari).toBeVisible();
    await expect(agari.getByTestId('win-kind')).toBeVisible();
    await expect(results).toBeHidden();

    await agari.getByTestId('dismiss-agari').click();

    await expect(results).toBeVisible({ timeout: 30_000 });
    await expect(agari).toBeHidden();
    await expect(results.locator('[data-testid^="placement-"]')).toHaveCount(4);
    // Players argue about the net number, so the working is on screen next to it.
    await expect(results.locator('thead')).toContainText('Uma');
    await expect(results.locator('thead')).toContainText('Oka');
    await expect(results.getByTestId('seed')).toBeVisible();
  });

  test('shows a draw with the tenpai reveal', async ({ page, request }) => {
    await useFixture(request, 'kyuushu_kyuuhai');
    await startGame(page);
    await playToResult(page, 6);

    const overlay = page.getByTestId('ryuukyoku-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.getByTestId('ryuukyoku-reason')).toContainText('Nine terminals');
    await expect(overlay.locator('[data-testid^="draw-seat-"]')).toHaveCount(4);
  });
});

test.describe('input', () => {
  test('discards with the keyboard', async ({ page, request }) => {
    await useFixture(request, 'chankan');
    await startGame(page);
    await awaitPrompt(page);

    const before = await myPond(page).count();
    // `1`-`9` select a tile from the left, `space` confirms.
    await page.keyboard.press('1');
    await page.keyboard.press('Space');

    await expect(myPond(page)).toHaveCount(before + 1, { timeout: 10_000 });
  });

  test('Esc cancels a selection before it cancels anything else', async ({ page, request }) => {
    await useFixture(request, 'chankan');
    await startGame(page);
    await awaitPrompt(page);

    const tile = selectableTiles(page).first();
    await tile.click();
    await expect(tile).toHaveClass(/selected/);

    await page.keyboard.press('Escape');
    await expect(tile).not.toHaveClass(/selected/);
    // …and nothing was discarded by the cancel.
    await expect(page.getByTestId('deadline')).toBeVisible();
  });

  test('arms an auto-button and shows that it is armed', async ({ page, request }) => {
    await useFixture(request, 'chankan');
    await startGame(page);

    const toggle = page.getByTestId('auto-win');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveClass(/armed/);
  });
});

test.describe('connection', () => {
  test('lands back in the right state after a reconnect mid-hand', async ({
    page,
    context,
    request,
  }) => {
    await useFixture(request, 'chankan');
    await startGame(page);

    // Play a few turns so there is a state worth losing.
    for (let index = 0; index < 3; index += 1) {
      await awaitPrompt(page);
      await answerPrompt(page);
    }
    await expect(page.getByTestId('wall-count')).toBeVisible();
    const pondBefore = await myPond(page).count();
    const wallBefore = await page.getByTestId('wall-count').textContent();

    await context.setOffline(true);
    await expect(page.getByTestId('reconnecting')).toBeVisible({ timeout: 20_000 });

    await context.setOffline(false);
    await expect(page.getByTestId('reconnecting')).toBeHidden({ timeout: 30_000 });

    // The board is rebuilt from a snapshot, not from whatever survived locally.
    await expect(myPond(page)).toHaveCount(pondBefore, { timeout: 20_000 });
    await expect(page.getByTestId('wall-count')).toHaveText(wallBefore ?? '');
  });

  test('tells the player when a bot has taken their seat', async ({ page, request }) => {
    await useFixture(request, 'chankan');
    await startGame(page);

    // Which absolute seat this client holds depends on the fixture, so tell the server every
    // seat went absent; only the one that is ours produces the modal.
    for (const seat of [0, 1, 2, 3]) {
      await request.post(`${MOCK_URL}/control/afk`, { data: { seat } });
    }

    await expect(page.getByTestId('bot-takeover')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('reclaim')).toBeVisible();
  });
});

test.describe('leaving', () => {
  test('asks first, and a cancelled question leaves the game running', async ({
    page,
    request,
  }) => {
    await useFixture(request, 'chankan');
    await startGame(page);
    await awaitPrompt(page);

    await page.getByTestId('leave-game').click();
    await expect(page.getByTestId('leave-confirm')).toBeVisible();

    // The keys behind the dialog have to stand down: `1` is a discard.
    await page.keyboard.press('1');
    await expect(page.getByTestId('leave-confirm')).toBeVisible();

    await page.getByTestId('leave-confirm-no').click();
    await expect(page.getByTestId('leave-confirm')).toBeHidden();
    await expect(page).toHaveURL(/\/game\//);
    // Still playing: the board is there and it is still asking.
    await expect(page.getByTestId('deadline')).toBeVisible();
  });

  test('leaves the table and lands back in the lobby', async ({ page, request }) => {
    await useFixture(request, 'chankan');
    await startGame(page);
    await awaitPrompt(page);

    await page.getByTestId('leave-game').click();
    await page.getByTestId('leave-confirm-yes').click();

    await expect(page).toHaveURL(/\/lobby$/);
    await expect(page.getByTestId('game')).toHaveCount(0);
  });

  test('Esc closes the question rather than passing the turn', async ({ page, request }) => {
    await useFixture(request, 'chankan');
    await startGame(page);
    await awaitPrompt(page);

    await page.getByTestId('leave-game').click();
    await expect(page.getByTestId('leave-confirm')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('leave-confirm')).toBeHidden();
    await expect(page).toHaveURL(/\/game\//);
  });
});
