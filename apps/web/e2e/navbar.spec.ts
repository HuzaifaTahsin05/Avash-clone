import { test, expect } from '@playwright/test';

test.describe('navbar', () => {
  test('is present on every routed page, including the 404 route', async ({ page }) => {
    for (const path of [
      '/',
      '/weather',
      '/risk',
      '/login',
      '/symptoms',
      '/report',
      '/resources',
      '/moderation',
      '/this-route-does-not-exist',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    }
  });

  test('links navigate to the right page and mark the active route', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });

    await nav.getByRole('link', { name: 'Weather' }).click();
    await expect(page).toHaveURL(/\/weather$/);
    await expect(nav.getByRole('link', { name: 'Weather' })).toHaveClass(/navbar__link--active/);

    await nav.getByRole('link', { name: 'Risk Map' }).click();
    await expect(page).toHaveURL(/\/risk$/);
    await expect(nav.getByRole('link', { name: 'Risk Map' })).toHaveClass(/navbar__link--active/);

    await nav.getByRole('link', { name: 'Symptoms' }).click();
    await expect(page).toHaveURL(/\/symptoms$/);
    await expect(nav.getByRole('link', { name: 'Symptoms' })).toHaveClass(/navbar__link--active/);

    await nav.getByRole('link', { name: 'Report' }).click();
    await expect(page).toHaveURL(/\/report$/);
    await expect(nav.getByRole('link', { name: 'Report' })).toHaveClass(/navbar__link--active/);

    await nav.getByRole('link', { name: 'Resources' }).click();
    await expect(page).toHaveURL(/\/resources$/);
    await expect(nav.getByRole('link', { name: 'Resources' })).toHaveClass(/navbar__link--active/);

    await nav.getByRole('link', { name: /আভাস/ }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('the moderation link is absent for a signed-out visitor, and a sign-in link is offered instead', async ({
    page,
  }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Moderation' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });
});
