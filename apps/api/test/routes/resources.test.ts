import { describe, test, expect } from 'vitest';
import { Hono } from 'hono';
import type { RateLimitRedisLike } from '@avash/security';
import { createResources } from '../../src/routes/resources';
import { requestId } from '../../src/middleware/request-id';
import type { AppEnv } from '../../src/types';
import { signTestJwt } from '../helpers/fakeJwt';

function fakeRedis(): RateLimitRedisLike {
  const sets = new Map<string, Map<string, number>>();
  return {
    async zadd(key, entry) {
      const set = sets.get(key) ?? new Map<string, number>();
      set.set(entry.member, entry.score);
      sets.set(key, set);
      return 1;
    },
    async zremrangebyscore() {
      return 0;
    },
    async zcard(key) {
      return sets.get(key)?.size ?? 0;
    },
    async expire() {
      return 1;
    },
  };
}

function buildApp() {
  const app = new Hono<AppEnv>();
  app.use('*', requestId());
  app.route('/', createResources({ redisFactory: fakeRedis }));
  return app;
}

const env = { SUPABASE_JWT_SECRET: 'test-jwt-secret-do-not-use-in-production' } as never;

describe('GET /api/resources/hospitals — contract-shaped stub (Phase 0)', () => {
  test('a valid bbox → 501', async () => {
    const res = await buildApp().request('/hospitals?bbox=89,23,91,24', {}, env);
    expect(res.status).toBe(501);
  });

  test('a malformed bbox → 400', async () => {
    const res = await buildApp().request('/hospitals?bbox=not-a-bbox', {}, env);
    expect(res.status).toBe(400);
  });

  test('a missing bbox → 400', async () => {
    const res = await buildApp().request('/hospitals', {}, env);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/resources/blood — contract-shaped stub (Phase 0)', () => {
  test('a known group with lat/lng → 501', async () => {
    const res = await buildApp().request('/blood?bloodGroup=O%2B&lat=23.78&lng=90.4', {}, env);
    expect(res.status).toBe(501);
  });

  test('an unknown blood group → 400', async () => {
    const res = await buildApp().request('/blood?bloodGroup=Z%2B&lat=23.78&lng=90.4', {}, env);
    expect(res.status).toBe(400);
  });

  test('a missing lat/lng → 400', async () => {
    const res = await buildApp().request('/blood?bloodGroup=O%2B', {}, env);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/resources/blood/:id — contract-shaped stub (Phase 0)', () => {
  const validId = '11111111-1111-4111-8111-111111111111';

  test('no token → 401', async () => {
    const res = await buildApp().request(
      `/blood/${validId}`,
      { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unitsAvailable: 5, plateletUnits: 1 }) },
      env
    );
    expect(res.status).toBe(401);
  });

  test('authenticated, wildly implausible units → 400', async () => {
    const token = await signTestJwt({});
    const res = await buildApp().request(
      `/blood/${validId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ unitsAvailable: 99999, plateletUnits: 1 }),
      },
      env
    );
    expect(res.status).toBe(400);
  });

  test('authenticated, negative units → 400', async () => {
    const token = await signTestJwt({});
    const res = await buildApp().request(
      `/blood/${validId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ unitsAvailable: -1, plateletUnits: 1 }),
      },
      env
    );
    expect(res.status).toBe(400);
  });

  test('authenticated, malformed id → 400, not a database error', async () => {
    const token = await signTestJwt({});
    const res = await buildApp().request(
      '/blood/not-a-uuid',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ unitsAvailable: 5, plateletUnits: 1 }),
      },
      env
    );
    expect(res.status).toBe(400);
  });

  test('authenticated, valid body → 501', async () => {
    const token = await signTestJwt({});
    const res = await buildApp().request(
      `/blood/${validId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ unitsAvailable: 5, plateletUnits: 1 }),
      },
      env
    );
    expect(res.status).toBe(501);
  });
});
