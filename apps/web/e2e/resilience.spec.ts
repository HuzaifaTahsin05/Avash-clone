import { test, expect } from '@playwright/test';

const HEALTH_URL = 'http://localhost:8787/health';

test.describe('resilience — malformed and hung responses', () => {
  test('a response body that is not valid JSON renders the generic error state', async ({
    page,
  }) => {
    await page.route(HEALTH_URL, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'not json at all' })
    );
    await page.goto('/');

    const status = page.getByTestId('status-error');
    await expect(status).toBeVisible();
    await expect(status).toContainText('unavailable');
  });

  test('a request that never resolves is aborted and falls back to the error state', async ({
    page,
  }) => {
    // apps/web/src/lib/apiClient.ts aborts via AbortController after
    // API_CLIENT_TIMEOUT_MS (8s) — this proves the abort path renders the
    // same generic error state as a network failure, not an infinite
    // spinner. React Query's queryClient (retry: 1, default backoff) retries
    // once after the first abort, so the worst case is roughly two 8s
    // timeouts plus a ~1s backoff — the assertion timeout below is set well
    // above that ceiling rather than tuned to the observed value.
    await page.route(HEALTH_URL, () => {
      // Never call route.fulfill/abort — the request hangs until the
      // client-side AbortController fires.
    });
    await page.goto('/');

    await expect(page.getByTestId('status-loading')).toBeVisible();
    await expect(page.getByTestId('status-error')).toBeVisible({ timeout: 25_000 });
  });
});
