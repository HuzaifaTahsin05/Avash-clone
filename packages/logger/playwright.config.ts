import { defineConfig } from '@playwright/test';

/**
 * Pure logic package — no HTTP server, no browser. Playwright Test is used
 * here purely as the assertion/runner layer (`test`/`expect`), the same
 * tool as apps/web's e2e specs and apps/api's API specs, so the whole
 * repo has one automated test framework instead of Playwright-for-web
 * plus Vitest-for-everything-else.
 */
export default defineConfig({
  testDir: './test',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'html',
});
