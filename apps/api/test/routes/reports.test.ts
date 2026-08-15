import { describe, test, expect, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { RateLimitRedisLike } from '@avash/security';
import { createReports } from '../../src/routes/reports';
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
  app.route('/', createReports({ redisFactory: fakeRedis }));
  return app;
}

const env = {
  SUPABASE_JWT_SECRET: 'test-jwt-secret-do-not-use-in-production',
  TURNSTILE_SECRET_KEY: 'test-secret',
} as never;

function stubTurnstileSuccess() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
}

describe('POST /api/reports/breeding-site — contract-shaped stub (Phase 0)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('missing turnstileToken → 403 before the body is even schema-checked', async () => {
    const res = await buildApp().request(
      '/breeding-site',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: 23.78, lng: 90.4 }) },
      env
    );
    expect(res.status).toBe(403);
  });

  test('valid turnstile + schema-valid body → 501', async () => {
    stubTurnstileSuccess();

    const res = await buildApp().request(
      '/breeding-site',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lat: 23.78, lng: 90.4, turnstileToken: 'good-token' }),
      },
      env
    );
    expect(res.status).toBe(501);
  });

  test('valid turnstile, lat out of range → 400', async () => {
    stubTurnstileSuccess();

    const res = await buildApp().request(
      '/breeding-site',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lat: 999, lng: 90.4, turnstileToken: 'good-token' }),
      },
      env
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/reports/breeding-site/:id/verify — contract-shaped stub (Phase 0)', () => {
  const validId = '11111111-1111-4111-8111-111111111111';

  test('no token → 401', async () => {
    const res = await buildApp().request(
      `/breeding-site/${validId}/verify`,
      { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'verified' }) },
      env
    );
    expect(res.status).toBe(401);
  });

  test('authenticated non-moderator → 403', async () => {
    const token = await signTestJwt({});
    const res = await buildApp().request(
      `/breeding-site/${validId}/verify`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'verified' }),
      },
      env
    );
    expect(res.status).toBe(403);
  });

  test('moderator, malformed id → 400, not a database error', async () => {
    const token = await signTestJwt({ role: 'moderator' });
    const res = await buildApp().request(
      '/breeding-site/not-a-uuid/verify',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'verified' }),
      },
      env
    );
    expect(res.status).toBe(400);
  });

  test('moderator, invalid status → 400', async () => {
    const token = await signTestJwt({ role: 'moderator' });
    const res = await buildApp().request(
      `/breeding-site/${validId}/verify`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'pending' }),
      },
      env
    );
    expect(res.status).toBe(400);
  });

  test('moderator, valid status → 501', async () => {
    const token = await signTestJwt({ role: 'moderator' });
    const res = await buildApp().request(
      `/breeding-site/${validId}/verify`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'verified' }),
      },
      env
    );
    expect(res.status).toBe(501);
  });
});
