import { describe, test, expect } from 'vitest';
import { Hono } from 'hono';
import { auth } from '../../src/middleware/auth';
import { requestId } from '../../src/middleware/request-id';
import type { AppEnv } from '../../src/types';
import { signTestJwt } from '../helpers/fakeJwt';

function buildApp(options?: Parameters<typeof auth>[0]) {
  const app = new Hono<AppEnv>();
  app.use('*', requestId());
  app.get('/protected', auth(options), (c) => {
    const user = c.get('user');
    return c.json({ userId: user?.id, role: user?.role });
  });
  return app;
}

const env = {
  SUPABASE_JWT_SECRET: 'test-jwt-secret-do-not-use-in-production',
} as never;

describe('auth middleware', () => {
  test('no Authorization header → 401', async () => {
    const app = buildApp();
    const res = await app.request('/protected', {}, env);
    expect(res.status).toBe(401);
  });

  test('malformed Authorization header → 401', async () => {
    const app = buildApp();
    const res = await app.request('/protected', { headers: { Authorization: 'garbage' } }, env);
    expect(res.status).toBe(401);
  });

  test('expired token → 401', async () => {
    const app = buildApp();
    const token = await signTestJwt({ expiresInSeconds: -3600 - 120 });
    const res = await app.request('/protected', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(401);
  });

  test('token signed with the wrong secret → 401', async () => {
    const app = buildApp();
    const token = await signTestJwt({ secret: 'wrong-secret' });
    const res = await app.request('/protected', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(401);
  });

  test('valid token, wrong role → 403', async () => {
    const app = buildApp({ role: 'admin' });
    const token = await signTestJwt({ role: 'moderator' });
    const res = await app.request('/protected', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(403);
  });

  test('valid token, right role → handler runs and c.get("user") is populated', async () => {
    const app = buildApp({ role: 'moderator' });
    const token = await signTestJwt({ role: 'moderator' });
    const res = await app.request('/protected', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string; role: string };
    expect(body.userId).toBe('11111111-1111-4111-8111-111111111111');
    expect(body.role).toBe('moderator');
  });

  test('no role requirement, any valid token passes', async () => {
    const app = buildApp();
    const token = await signTestJwt({});
    const res = await app.request('/protected', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
  });

  test('401 and 403 bodies never differ by message, only by status', async () => {
    const noTokenApp = buildApp();
    const wrongRoleApp = buildApp({ role: 'admin' });
    const token = await signTestJwt({ role: 'moderator' });

    const res401 = await noTokenApp.request('/protected', {}, env);
    const res403 = await wrongRoleApp.request(
      '/protected',
      { headers: { Authorization: `Bearer ${token}` } },
      env
    );

    const body401 = (await res401.json()) as { error: { message: string } };
    const body403 = (await res403.json()) as { error: { message: string } };
    expect(body401.error.message).toBe(body403.error.message);
  });
});
