import { defineConfig } from '@playwright/test';

/**
 * Schema tests run as plain SQL assertions against a live
 * Postgres — no HTTP server, no browser, same "assertion/runner layer
 * only" use of Playwright Test as packages/logger's tests. Every spec
 * skips itself (rather than failing) when no database is reachable —
 * see test/schema.spec.ts.
 */
export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'html',
});
