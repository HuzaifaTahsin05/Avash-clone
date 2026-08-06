import { defineConfig } from '@playwright/test';

/**
 * Backend tests run as real HTTP requests against a live `wrangler dev`
 * instance (Miniflare) — the same "test the real runtime, not a mock"
 * philosophy as apps/web's Playwright config testing `pnpm preview`
 * instead of the Vite dev server. No browser projects are declared:
 * every spec uses Playwright's `request` fixture (a plain HTTP client)
 * or plain in-process assertions, never `page`.
 *
 * Two runtimes, one suite (ADR-012). By default this starts `wrangler dev`
 * (workerd) — the production runtime. Set API_TEST_TARGET=container to run
 * the identical specs against an already-running API container (Node)
 * instead. CI runs both; a spec that passes on one and fails on the other
 * is a real divergence, not a flake.
 */
const isContainerTarget = process.env.API_TEST_TARGET === 'container';

export default defineConfig({
  testDir: './test',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: process.env.API_TEST_BASE_URL ?? 'http://127.0.0.1:8787',
  },
  ...(isContainerTarget
    ? {}
    : {
        webServer: {
          command: 'pnpm dev',
          url: 'http://127.0.0.1:8787/health',
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
      }),
});
