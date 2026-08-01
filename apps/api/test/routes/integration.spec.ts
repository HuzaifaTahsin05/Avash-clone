import { test, expect } from '@playwright/test';
import { healthResponseSchema } from '@avash/types';

/**
 * M4-T10 — asserts the exact contract `apps/web`'s apiClient depends on:
 * the health body matches the shared `packages/types` schema field-for-field,
 * and a CORS preflight succeeds from an allowed origin / fails from a
 * disallowed one, in both directions.
 */
test.describe('health response contract (shared with apps/web)', () => {
  test('body parses against the shared schema with exactly the expected keys', async ({
    request,
  }) => {
    const res = await request.get('/health');
    const body = await res.json();
    const parsed = healthResponseSchema.parse(body);
    expect(Object.keys(body).sort()).toEqual(Object.keys(parsed).sort());
  });
});

test.describe('CORS preflight (OPTIONS)', () => {
  test('an allowed origin gets a successful preflight response', async ({ request }) => {
    const res = await request.fetch('/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://avash.pages.dev',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.status()).toBe(204);
    expect(res.headers()['access-control-allow-origin']).toBe('https://avash.pages.dev');
    expect(res.headers()['access-control-allow-methods']).toBeTruthy();
  });

  test('a disallowed origin gets a rejected preflight response', async ({ request }) => {
    const res = await request.fetch('/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.status()).toBe(403);
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
  });
});
