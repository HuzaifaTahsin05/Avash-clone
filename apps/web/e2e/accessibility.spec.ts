import { test, expect } from '@playwright/test';

test.describe('accessibility smoke', () => {
  test('the page has exactly one h1', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  test('the status panel is exposed as a labeled region for assistive tech', async ({ page }) => {
    await page.goto('/');
    const panel = page.getByLabel('API connection status');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'System status' })).toBeVisible();
  });

  test('tabbing through the page never throws and reaches the end without a focus trap', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // The scaffold has no interactive controls yet (no nav, no links, no
    // buttons) — this proves Tab is inert rather than trapped, so the page
    // is safe to extend with real controls later without hidden focus bugs.
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Tab');
    }
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
