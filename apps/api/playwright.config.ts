import { defineConfig } from '@playwright/test';

/**
 * Backend tests run as real HTTP requests against a live `wrangler dev`
 * instance (Miniflare) — the same "test the real runtime, not a mock"
 * philosophy as apps/web's Playwright config testing `pnpm preview`
 * instead of the Vite dev server. No browser projects are declared:
 * every spec uses Playwright's `request` fixture (a plain HTTP client)
 * or plain in-process assertions, never `page`.
 */
export default defineConfig({
  testDir: './test',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:8787',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:8787/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
