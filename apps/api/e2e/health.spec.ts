import { test, expect } from '@playwright/test';
import { healthResponseSchema } from '@avash/types';

/**
 * Boundary/contract suite only — real HTTP against a live server, on both
 * runtimes (ADR-012). Exhaustive case coverage (every status path, the
 * full CORS matrix, header handling, the error boundary) lives in the
 * workerd Vitest project (apps/api/test/routes/health.test.ts); this
 * suite proves each of those layers actually works over the wire, once
 * each, not a second copy of the same assertion matrix.
 */
test('GET /health returns a schema-valid 200 over real HTTP', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(() => healthResponseSchema.parse(body)).not.toThrow();
});

test('a disallowed CORS origin gets no Access-Control-Allow-Origin header', async ({ request }) => {
  const res = await request.get('/health', { headers: { Origin: 'https://evil.example' } });
  expect(res.headers()['access-control-allow-origin']).toBeUndefined();
});

test('an allowed CORS origin gets the matching header back', async ({ request }) => {
  const res = await request.get('/health', { headers: { Origin: 'https://avash.pages.dev' } });
  expect(res.headers()['access-control-allow-origin']).toBe('https://avash.pages.dev');
});

test('an allowed origin gets a successful OPTIONS preflight response', async ({ request }) => {
  const res = await request.fetch('/health', {
    method: 'OPTIONS',
    headers: { Origin: 'https://avash.pages.dev', 'Access-Control-Request-Method': 'GET' },
  });
  expect(res.status()).toBe(204);
});

test('an unknown route returns the generic typed 404 error shape', async ({ request }) => {
  const res = await request.get('/does-not-exist');
  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body.error.message).toBeTruthy();
  expect(body.error.requestId).toBeTruthy();
});
