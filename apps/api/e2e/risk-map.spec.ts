import { test, expect } from '@playwright/test';
import { riskMapResponseSchema, riskDetailResponseSchema } from '@avash/types';

/**
 * Boundary/contract suite only — real HTTP against a live server, on both
 * runtimes (ADR-012, API_TEST_TARGET=container). Written against the
 * frozen contract (`packages/types/api.ts`, `docs/PROJECT_PLAN.md` §6),
 * not against the route bodies — the routes are contract-shaped stubs as
 * of this writing (`apps/api/src/routes/risk-map.ts`): `GET /api/risk/:regionId`
 * currently 404s for every well-formed UUID until the real read replaces
 * the stub, which the "well-formed-unknown region" test below documents
 * as expected, contract-level behavior rather than a bug. Exhaustive case
 * coverage belongs in the workerd Vitest project; this suite proves each
 * boundary once, over the wire.
 */

test.describe('GET /api/risk-map', () => {
  test('returns a schema-valid 200 over real HTTP', async ({ request }) => {
    const res = await request.get('/api/risk-map');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(() => riskMapResponseSchema.parse(body)).not.toThrow();
  });

  test('sets the RISK_MAP_CACHE_TTL_S Cache-Control header', async ({ request }) => {
    const res = await request.get('/api/risk-map');
    expect(res.headers()['cache-control']).toContain('s-maxage=300');
    expect(res.headers()['cache-control']).toContain('stale-while-revalidate=600');
  });

  test('a disallowed CORS origin gets no Access-Control-Allow-Origin header', async ({ request }) => {
    const res = await request.get('/api/risk-map', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
  });

  test('an oversized bbox is a generic 400, not a raw validation error', async ({ request }) => {
    // BBOX_MAX_SPAN_DEG is 10; this span is far larger on both axes.
    const res = await request.get('/api/risk-map?bbox=-180,-90,180,90');
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBeTruthy();
    expect(body.error.requestId).toBeTruthy();
    expect(JSON.stringify(body).toLowerCase()).not.toContain('stack');
  });
});

test.describe('GET /api/risk/:regionId', () => {
  test('returns a schema-valid 200 for a well-formed, seeded region over real HTTP', async ({ request }) => {
    // Contract expectation once the real read replaces the stub: a
    // well-formed, existing region returns 200 with a body matching
    // riskDetailResponseSchema. The route is still an unconditional 404
    // stub as of this writing (apps/api/src/routes/risk-map.ts) — this
    // case is expected red until that lands and a seeded region UUID is
    // wired in; it is not a re-run of the 400/404 boundary cases below.
    const res = await request.get('/api/risk/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(() => riskDetailResponseSchema.parse(body)).not.toThrow();
  });

  test('a well-formed but unknown region is a generic 404, not a raw error', async ({ request }) => {
    const res = await request.get('/api/risk/ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBeTruthy();
    expect(body.error.requestId).toBeTruthy();
  });

  test('a disallowed CORS origin gets no Access-Control-Allow-Origin header', async ({ request }) => {
    const res = await request.get('/api/risk/00000000-0000-0000-0000-000000000000', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
  });

  test('a malformed regionId is a generic 400, not a raw validation error', async ({ request }) => {
    const res = await request.get('/api/risk/not-a-uuid');
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBeTruthy();
    expect(body.error.requestId).toBeTruthy();
    expect(JSON.stringify(body).toLowerCase()).not.toContain('stack');
  });
});
