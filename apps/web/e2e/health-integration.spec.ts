import { test, expect } from '@playwright/test';

const HEALTH_URL = 'http://localhost:8787/health';

const VALID_PAYLOAD = {
  status: 'ok',
  version: '1.0.0',
  environment: 'test',
  timestamp: new Date().toISOString(),
  requestId: '00000000-0000-0000-0000-000000000000',
};

test.describe('health integration — four UI states (M4-T11)', () => {
  test('success — live values render from an intercepted /health response', async ({ page }) => {
    await page.route(HEALTH_URL, (route) => route.fulfill({ json: VALID_PAYLOAD }));
    await page.goto('/');

    const status = page.getByTestId('status-success');
    await expect(status).toBeVisible();
    await expect(status).toContainText('ok');
    await expect(status).toContainText('test');
    await expect(status).toContainText('1.0.0');
  });

  test('loading — skeleton appears, then resolves with no layout shift', async ({ page }) => {
    await page.route(HEALTH_URL, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ json: VALID_PAYLOAD });
    });
    await page.goto('/');

    const panel = page.getByLabel('API connection status');
    const loading = page.getByTestId('status-loading');
    await expect(loading).toBeVisible();
    const boxBefore = await panel.boundingBox();

    const success = page.getByTestId('status-success');
    await expect(success).toBeVisible();
    const boxAfter = await panel.boundingBox();

    expect(boxAfter?.height).toBe(boxBefore?.height);
  });

  test('error — generic message renders, no raw error or stack in the DOM', async ({ page }) => {
    await page.route(HEALTH_URL, (route) => route.fulfill({ status: 500, body: 'boom' }));
    await page.goto('/');

    const status = page.getByTestId('status-error');
    await expect(status).toBeVisible();
    await expect(status).toContainText('unavailable');

    const html = await page.content();
    expect(html).not.toContain('boom');
    expect(html.toLowerCase()).not.toContain('stack');
  });

  test('offline — offline state renders when the browser is offline', async ({ page, context }) => {
    await page.route(HEALTH_URL, (route) => route.fulfill({ json: VALID_PAYLOAD }));
    await page.goto('/');
    await expect(page.getByTestId('status-success')).toBeVisible();

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    await expect(page.getByTestId('status-offline')).toBeVisible();
    await context.setOffline(false);
  });

  test('rejects a schema-invalid payload instead of rendering garbage', async ({ page }) => {
    await page.route(HEALTH_URL, (route) =>
      route.fulfill({ json: { unexpected: 'shape', nothing: 'matches' } })
    );
    await page.goto('/');

    await expect(page.getByTestId('status-error')).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('unexpected');
  });
});
