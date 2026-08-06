import { test, expect } from '@playwright/test';

test.describe('frontend scaffold smoke', () => {
  test('renders the title and description', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('আভাস');
    await expect(page.getByText('সুরক্ষার আগাম বার্তা')).toBeVisible();
  });

  test('renders the status panel', async ({ page }) => {
    // The panel fetches live health data (see e2e/health-integration.spec.ts
    // for the four connectivity states); this smoke test only proves the panel exists.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'System status' })).toBeVisible();
  });

  test('an unknown path renders the client-side 404 route', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('৪০৪');
  });

  test('emits zero console errors during load', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });
});
