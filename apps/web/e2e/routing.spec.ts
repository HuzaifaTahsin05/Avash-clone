import { test, expect } from '@playwright/test';

test.describe('routing', () => {
  test('back and forward navigation restores the correct route', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('আভাস');

    await page.goto('/this-route-does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('৪০৪');

    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('আভাস');

    await page.goForward();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('৪০৪');
  });

  test('a hard refresh mid-session re-renders the same route', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('৪০৪');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('৪০৪');
  });

  test('a deep unknown path also falls through to the 404 route', async ({ page }) => {
    await page.goto('/reports/123/edit');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('৪০৪');
  });
});
