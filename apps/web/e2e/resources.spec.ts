import { test, expect } from '@playwright/test';

/**
 * `/resources` page, driven by route interception against the frozen
 * contract (`packages/types/api.ts` — bloodSearchResponseSchema), never a
 * live `apps/api`. Mirrors `apps/web/e2e/weather.spec.ts`'s shape.
 */

const BLOOD_URL_PATTERN = 'http://localhost:8787/api/resources/blood**';

const BLOOD_PAYLOAD = {
  results: [
    {
      inventoryId: 1,
      hospital: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Dhaka Medical College Hospital',
        address: 'Bakshibazar, Dhaka',
        phone: '+8801000000000',
        verified: true,
        lat: 23.72,
        lng: 90.4,
      },
      bloodGroup: 'O+',
      unitsAvailable: 12,
      plateletUnits: 3,
      distanceM: 850.5,
      updatedAt: '2026-08-14T00:00:00.000Z',
    },
  ],
  generatedAt: '2026-08-14T00:05:00.000Z',
  requestId: '00000000-0000-0000-0000-000000000003',
};

test.describe('resources ticker', () => {
  test('the list renders from the API', async ({ page }) => {
    await page.route(BLOOD_URL_PATTERN, (route) => route.fulfill({ json: BLOOD_PAYLOAD }));

    await page.goto('/resources');

    await expect(page.getByTestId('status-success')).toBeVisible();
    await expect(page.getByTestId('hospital-row')).toHaveCount(1);
    await expect(page.getByTestId('hospital-row')).toContainText('Dhaka Medical College Hospital');
    await expect(page.getByTestId('hospital-row')).toContainText('12');
  });

  test('degrades gracefully when the Realtime channel is blocked — the initial list still renders', async ({
    page,
  }) => {
    await page.route(BLOOD_URL_PATTERN, (route) => route.fulfill({ json: BLOOD_PAYLOAD }));

    // Playwright 1.46 (this repo's pinned version) has no
    // page.routeWebSocket() — that landed in 1.48. Block the Realtime
    // channel at the WebSocket constructor instead, installed before any
    // app script runs, so supabase-js's connection attempt fails
    // immediately and the channel's subscribe status callback reports an
    // error/closed state (mirrors the route-blocking intent of
    // apps/web/e2e/resilience.spec.ts, adapted for a transport
    // page.route cannot intercept).
    await page.addInitScript(() => {
      class BlockedWebSocket extends EventTarget {
        static readonly CONNECTING = 0;
        static readonly OPEN = 1;
        static readonly CLOSING = 2;
        static readonly CLOSED = 3;
        readyState = 3;
        constructor() {
          super();
          setTimeout(() => {
            this.dispatchEvent(new Event('error'));
            this.dispatchEvent(new CloseEvent('close', { code: 1006, reason: 'blocked for test' }));
          }, 0);
        }
        send() {}
        close() {}
      }
      // @ts-expect-error — deliberate test-only override of the global.
      window.WebSocket = BlockedWebSocket;
    });

    await page.goto('/resources');

    // The initial fetch-backed list must render regardless — never blank
    // just because the live channel couldn't connect.
    await expect(page.getByTestId('status-success')).toBeVisible();
    await expect(page.getByTestId('hospital-row')).toHaveCount(1);
    await expect(page.getByTestId('realtime-unavailable')).toBeVisible({ timeout: 15_000 });
  });

  test('a failed blood API response renders the generic error state with no raw error text', async ({
    page,
  }) => {
    await page.route(BLOOD_URL_PATTERN, (route) => route.fulfill({ status: 500, body: 'boom' }));

    await page.goto('/resources');

    const status = page.getByTestId('resources-error');
    await expect(status).toBeVisible();

    const html = await page.content();
    expect(html).not.toContain('boom');
    expect(html.toLowerCase()).not.toContain('stack');
    expect(html.toLowerCase()).not.toContain('internal server error');
  });
});
