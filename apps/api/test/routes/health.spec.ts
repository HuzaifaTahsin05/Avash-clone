import { test, expect } from '@playwright/test';
import { Hono } from 'hono';
import { healthResponseSchema } from '@avash/types';
import { handleError, type GenericErrorBody } from '@avash/logger';
import { requestId } from '../../src/middleware/request-id';
import type { AppEnv } from '../../src/types';

test.describe('GET /health', () => {
  test('returns 200 with a schema-valid body', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(() => healthResponseSchema.parse(body)).not.toThrow();
  });

  test('carries all five §7.4 security headers', async ({ request }) => {
    const res = await request.get('/health');
    const headers = res.headers();
    expect(headers['strict-transport-security']).toBeTruthy();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toBeTruthy();
  });

  test('carries X-Request-Id', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.headers()['x-request-id']).toBeTruthy();
  });
});

test.describe('unknown routes', () => {
  test('returns a generic typed 404 JSON body', async ({ request }) => {
    const res = await request.get('/does-not-exist');
    expect(res.status()).toBe(404);
    const body = (await res.json()) as GenericErrorBody;
    expect(body.error.message).toBeTruthy();
    expect(body.error.requestId).toBeTruthy();
  });
});

test.describe('CORS allow-list (env-driven, wrangler.toml CORS_ALLOWED_ORIGINS / CORS_PREVIEW_ORIGIN_SUFFIX)', () => {
  test('gives a disallowed origin no CORS header back', async ({ request }) => {
    const res = await request.get('/health', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
  });

  test('gives the exact allowed production origin the matching CORS header back', async ({
    request,
  }) => {
    const res = await request.get('/health', {
      headers: { Origin: 'https://avash.pages.dev' },
    });
    expect(res.headers()['access-control-allow-origin']).toBe('https://avash.pages.dev');
  });

  test('gives a PR-preview-suffix origin the matching CORS header back', async ({ request }) => {
    const res = await request.get('/health', {
      headers: { Origin: 'https://pr-99.avash.pages.dev' },
    });
    expect(res.headers()['access-control-allow-origin']).toBe('https://pr-99.avash.pages.dev');
  });
});

test.describe('error boundary (R10)', () => {
  // In-process, not against the live wrangler dev server: proving no
  // production route exists purely to be thrown at, this exercises the
  // same onError wiring pattern (requestId -> handler -> handleError)
  // used in src/index.ts, on a throwaway Hono instance built for the test.
  test('returns a generic body with no stack trace when a handler throws', async () => {
    const throwingApp = new Hono<AppEnv>();
    throwingApp.use('*', requestId());
    throwingApp.get('/boom', () => {
      throw new Error('internal detail that must never leak');
    });
    throwingApp.onError((error, c) => c.json(handleError(error, c.get('requestId')), 500));

    const res = await throwingApp.request('/boom');
    expect(res.status).toBe(500);
    const body = (await res.json()) as GenericErrorBody;
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('internal detail');
    expect(serialized).not.toContain('stack');
    expect(body.error.requestId).toBeTruthy();
  });
});
