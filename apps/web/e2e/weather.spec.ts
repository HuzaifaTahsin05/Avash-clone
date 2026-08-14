import { test, expect } from '@playwright/test';

/**
 * `/weather` page, driven purely by route interception against the frozen
 * contract (`packages/types/api.ts` — latestWeatherResponseSchema,
 * weatherHistoryResponseSchema), never a live `apps/api`. Written against
 * the contract, not the current page — `apps/web/src/pages/Weather.tsx`
 * is a placeholder (`<div>Weather</div>`) as of this writing, so every
 * test below is expected red until the real page lands and wires up the
 * data-testid contract this suite assumes (region selector, sparkline,
 * generic error state — the same convention `health-integration.spec.ts`
 * already established for the status panel). No `waitForTimeout`
 * anywhere — every wait is a web-first Playwright assertion.
 */

const LATEST_URL = 'http://localhost:8787/api/weather/latest';
const HISTORY_URL_PATTERN = 'http://localhost:8787/api/weather/history**';

const LATEST_PAYLOAD = {
  observations: [
    {
      regionId: '11111111-1111-1111-1111-111111111111',
      regionCode: 'dhaka',
      regionName: 'Dhaka',
      observedAt: '2026-08-14T06:00:00.000Z',
      tempMeanC: 29.4,
      tempMinC: 26.1,
      tempMaxC: 33.2,
      humidityPct: 78,
      precipitationMm: 4.2,
      source: 'openweathermap',
    },
    {
      regionId: '22222222-2222-2222-2222-222222222222',
      regionCode: 'chittagong',
      regionName: 'Chittagong',
      observedAt: '2026-08-14T06:00:00.000Z',
      tempMeanC: 28.1,
      tempMinC: 25.0,
      tempMaxC: 31.5,
      humidityPct: 82,
      precipitationMm: 12.7,
      source: 'openweathermap',
    },
  ],
  generatedAt: '2026-08-14T06:05:00.000Z',
  requestId: '00000000-0000-0000-0000-000000000001',
};

function historyPayloadFor(regionCode: string, regionName: string) {
  return {
    regionCode,
    regionName,
    windowDays: 14,
    points: [
      { observedAt: '2026-08-01T06:00:00.000Z', tempMeanC: 27.5, humidityPct: 75, precipitationMm: 1.1 },
      { observedAt: '2026-08-07T06:00:00.000Z', tempMeanC: 28.9, humidityPct: 79, precipitationMm: 6.4 },
      { observedAt: '2026-08-14T06:00:00.000Z', tempMeanC: 29.4, humidityPct: 78, precipitationMm: 4.2 },
    ],
    generatedAt: '2026-08-14T06:05:00.000Z',
    requestId: '00000000-0000-0000-0000-000000000002',
  };
}

test.describe('weather dashboard', () => {
  test('the page loads and renders the weather dashboard', async ({ page }) => {
    await page.route(LATEST_URL, (route) => route.fulfill({ json: LATEST_PAYLOAD }));
    await page.route(HISTORY_URL_PATTERN, (route) =>
      route.fulfill({ json: historyPayloadFor('dhaka', 'Dhaka') })
    );

    await page.goto('/weather');

    await expect(page.getByRole('heading', { name: /weather/i })).toBeVisible();
  });

  test('the region selector is populated with an option per observation', async ({ page }) => {
    await page.route(LATEST_URL, (route) => route.fulfill({ json: LATEST_PAYLOAD }));
    await page.route(HISTORY_URL_PATTERN, (route) =>
      route.fulfill({ json: historyPayloadFor('dhaka', 'Dhaka') })
    );

    await page.goto('/weather');

    const select = page.getByTestId('weather-region-select');
    await expect(select).toBeVisible();
    await expect(select.locator('option')).toHaveCount(LATEST_PAYLOAD.observations.length);
    await expect(select.getByRole('option', { name: 'Dhaka' })).toHaveCount(1);
    await expect(select.getByRole('option', { name: 'Chittagong' })).toHaveCount(1);
  });

  test('switching region changes the displayed values', async ({ page }) => {
    await page.route(LATEST_URL, (route) => route.fulfill({ json: LATEST_PAYLOAD }));
    await page.route(HISTORY_URL_PATTERN, (route) => {
      const url = new URL(route.request().url());
      const regionCode = url.searchParams.get('regionCode') ?? 'dhaka';
      const regionName = regionCode === 'chittagong' ? 'Chittagong' : 'Dhaka';
      return route.fulfill({ json: historyPayloadFor(regionCode, regionName) });
    });

    await page.goto('/weather');

    const select = page.getByTestId('weather-region-select');
    await expect(page.getByTestId('weather-observed-temp')).toContainText('29.4');

    await select.selectOption({ label: 'Chittagong' });

    await expect(page.getByTestId('weather-observed-temp')).toContainText('28.1');
  });

  test('the history sparkline renders', async ({ page }) => {
    await page.route(LATEST_URL, (route) => route.fulfill({ json: LATEST_PAYLOAD }));
    await page.route(HISTORY_URL_PATTERN, (route) =>
      route.fulfill({ json: historyPayloadFor('dhaka', 'Dhaka') })
    );

    await page.goto('/weather');

    await expect(page.getByTestId('weather-sparkline')).toBeVisible();
  });

  test('a failed weather API response renders the generic error state with no raw error text', async ({
    page,
  }) => {
    await page.route(LATEST_URL, (route) => route.fulfill({ status: 500, body: 'boom' }));
    await page.route(HISTORY_URL_PATTERN, (route) => route.fulfill({ status: 500, body: 'boom' }));

    await page.goto('/weather');

    const status = page.getByTestId('weather-error');
    await expect(status).toBeVisible();

    const html = await page.content();
    expect(html).not.toContain('boom');
    expect(html.toLowerCase()).not.toContain('stack');
    expect(html.toLowerCase()).not.toContain('internal server error');
  });
});
