import { test, expect } from '@playwright/test';

const HEALTH_URL = 'http://localhost:8787/health';

test.describe('security-adjacent behavior', () => {
  test('a script-bearing value in the health payload renders inert, never executes', async ({
    page,
  }) => {
    let dialogFired = false;
    page.on('dialog', async (dialog) => {
      dialogFired = true;
      await dialog.dismiss();
    });

    await page.route(HEALTH_URL, (route) =>
      route.fulfill({
        json: {
          status: 'ok',
          version: '1.0.0',
          environment: '<script>alert(1)</script>',
          timestamp: new Date().toISOString(),
          requestId: '00000000-0000-0000-0000-000000000000',
        },
      })
    );
    await page.goto('/');

    const status = page.getByTestId('status-success');
    await expect(status).toBeVisible();
    await expect(status).toContainText('<script>alert(1)</script>');
    expect(dialogFired).toBe(false);

    // React text nodes escape by default; assert no live <script> element
    // was ever inserted into the status panel's DOM subtree.
    const injectedScript = await page.locator('.status-panel script').count();
    expect(injectedScript).toBe(0);
  });

  test('the rendered page never leaks a server secret or internal URL', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'System status' })).toBeVisible();

    const html = await page.content();
    const lower = html.toLowerCase();
    for (const marker of ['service_role', 'supabase_service_role_key', 'wrangler.toml', 'sk-']) {
      expect(lower).not.toContain(marker);
    }
  });
});
