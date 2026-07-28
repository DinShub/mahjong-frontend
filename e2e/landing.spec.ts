import { expect, test } from '@playwright/test';

/**
 * The M0 acceptance criterion: `npm start` gives a page that says "connected" after a real socket
 * handshake (tasks/milestones.md). Here the peer is the mock server, which speaks the same
 * contract; the backend's own e2e suite covers the real gateway.
 */
test.describe('landing', () => {
  test('reports a live connection after the handshake', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Riichi Mahjong' })).toBeVisible();
    await expect(page.getByTestId('connection-label')).toHaveText('Connected');
    await expect(page.getByTestId('connection')).toHaveAttribute('data-status', 'connected');
  });

  test('shows what it connected to', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('protocol')).toHaveText('v1');
    await expect(page.getByTestId('server-url')).toHaveText('http://127.0.0.1:3100');
    await expect(page.getByTestId('session')).toHaveText('guest (unauthenticated)');
    await expect(page.getByTestId('error')).toHaveCount(0);
    await expect(page.getByTestId('retry')).toHaveCount(0);
  });

  test('recovers when the connection drops and comes back', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByTestId('connection-label')).toHaveText('Connected');

    await context.setOffline(true);
    await expect(page.getByTestId('connection-label')).toHaveText('Reconnecting…', {
      timeout: 15_000,
    });

    await context.setOffline(false);
    await expect(page.getByTestId('connection-label')).toHaveText('Connected', { timeout: 20_000 });
  });

  test('logs nothing to the console on the happy path', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));

    await page.goto('/');
    await expect(page.getByTestId('connection-label')).toHaveText('Connected');

    expect(problems).toEqual([]);
  });
});
