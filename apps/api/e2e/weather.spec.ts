import { test, expect } from '@playwright/test';
import { latestWeatherResponseSchema, weatherHistoryResponseSchema } from '@avash/types';

/**
 * Boundary/contract suite only — real HTTP against a live server, on both
 * runtimes (ADR-012, API_TEST_TARGET=container). Written against the
 * frozen contract (`packages/types/api.ts`, `docs/PROJECT_PLAN.md` §6),
 * not against the route bodies — the routes are contract-shaped stubs as
 * of this writing (`apps/api/src/routes/weather.ts`), so the schema and
 * cache-header assertions already pass; the 400 assertion exercises
 * validation that is already implemented ahead of the real DB read.
 * Exhaustive case coverage belongs in the workerd Vitest project; this
 * suite proves each boundary once, over the wire.
 */

test.describe('GET /api/weather/latest', () => {
  test('returns a schema-valid 200 over real HTTP', async ({ request }) => {
    const res = await request.get('/api/weather/latest');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(() => latestWeatherResponseSchema.parse(body)).not.toThrow();
  });

  test('sets the WEATHER_CACHE_TTL_S Cache-Control header', async ({ request }) => {
    const res = await request.get('/api/weather/latest');
    expect(res.headers()['cache-control']).toContain('s-maxage=900');
    expect(res.headers()['cache-control']).toContain('stale-while-revalidate=1800');
  });

  test('a disallowed CORS origin gets no Access-Control-Allow-Origin header', async ({ request }) => {
    const res = await request.get('/api/weather/latest', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
  });
});

test.describe('GET /api/weather/history', () => {
  test('returns a schema-valid 200 for a well-formed request over real HTTP', async ({ request }) => {
    const res = await request.get('/api/weather/history?regionCode=dhaka&days=7');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(() => weatherHistoryResponseSchema.parse(body)).not.toThrow();
  });

  test('sets the WEATHER_CACHE_TTL_S Cache-Control header', async ({ request }) => {
    const res = await request.get('/api/weather/history?regionCode=dhaka');
    expect(res.headers()['cache-control']).toContain('s-maxage=900');
    expect(res.headers()['cache-control']).toContain('stale-while-revalidate=1800');
  });

  test('a disallowed CORS origin gets no Access-Control-Allow-Origin header', async ({ request }) => {
    const res = await request.get('/api/weather/history?regionCode=dhaka', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
  });

  test('a missing regionCode is a generic 400, not a raw validation error', async ({ request }) => {
    const res = await request.get('/api/weather/history');
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBeTruthy();
    expect(body.error.requestId).toBeTruthy();
    expect(JSON.stringify(body).toLowerCase()).not.toContain('stack');
  });
});
