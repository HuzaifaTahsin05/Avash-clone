import { test, expect } from '@playwright/test';
import { hospitalsResponseSchema, bloodSearchResponseSchema } from '@avash/types';

/**
 * Boundary/contract suite only — real HTTP against a live server, on both
 * runtimes (ADR-012, API_TEST_TARGET=container). Mirrors
 * `apps/api/e2e/weather.spec.ts`'s shape: proves each boundary once, over
 * the wire, against the frozen contract (`packages/types/api.ts`); the
 * exhaustive authorization-boundary case coverage (staff-at-X-patching-Y,
 * rate limiting, etc.) lives in the workerd Vitest suite
 * (`apps/api/test/routes/resources.test.ts`), not here.
 */

test.describe('GET /api/resources/hospitals', () => {
  test('a valid bbox returns a schema-valid 200 over real HTTP', async ({ request }) => {
    const res = await request.get('/api/resources/hospitals?bbox=88,20,93,27');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(() => hospitalsResponseSchema.parse(body)).not.toThrow();
  });

  test('a malformed bbox is a generic 400, not a raw validation error', async ({ request }) => {
    const res = await request.get('/api/resources/hospitals?bbox=not-a-bbox');
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBeTruthy();
    expect(body.error.requestId).toBeTruthy();
    expect(JSON.stringify(body).toLowerCase()).not.toContain('stack');
  });
});

test.describe('GET /api/resources/blood', () => {
  test('a valid query returns a schema-valid 200 over real HTTP', async ({ request }) => {
    const res = await request.get('/api/resources/blood?bloodGroup=O%2B&lat=23.78&lng=90.4');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(() => bloodSearchResponseSchema.parse(body)).not.toThrow();
  });

  test('an unknown blood group is a generic 400', async ({ request }) => {
    const res = await request.get('/api/resources/blood?bloodGroup=Z%2B&lat=23.78&lng=90.4');
    expect(res.status()).toBe(400);
  });
});

test.describe('PATCH /api/resources/blood/:id', () => {
  test('without a token returns 401 over real HTTP', async ({ request }) => {
    const res = await request.patch('/api/resources/blood/11111111-1111-4111-8111-111111111111', {
      data: { unitsAvailable: 5, plateletUnits: 1 },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(JSON.stringify(body).toLowerCase()).not.toContain('stack');
  });
});
