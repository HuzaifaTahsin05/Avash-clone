import { test, expect } from '@playwright/test';
import { SignJWT } from 'jose';

/**
 * Boundary/contract suite only — real HTTP against a live server
 * (ADR-012), not a re-run of the exhaustive case matrix already covered
 * by `apps/api/test/routes/reports.test.ts` under workerd Vitest (which
 * injects fakes for Turnstile/Redis/Supabase/Gemini and exercises every
 * branch).
 *
 * Two upstreams this route depends on are not truly reachable/functional
 * from this local dev environment, and both boundaries turn out to be
 * useful things to prove over the wire rather than problems to work
 * around:
 *
 * - `TURNSTILE_SECRET_KEY` in `.dev.vars` does not verify against the
 *   real Cloudflare siteverify endpoint (no dummy/always-pass secret is
 *   documented anywhere in `docs/` for this project), so every create
 *   request gets a real 403 from Turnstile before the route ever parses
 *   the body or touches Supabase. That also means these tests can never
 *   write a row into the real Supabase project `.dev.vars` points at.
 * - `UPSTASH_REDIS_REST_URL`/`TOKEN` in `.dev.vars` do not point at a
 *   reachable Redis from here, so the verify route's rate-limit
 *   middleware (which runs *after* `auth`, *before* the handler) fails
 *   closed with 429 for any request that gets past authentication/role
 *   checks — by design (`apps/api/src/middleware/rate-limit.ts`: "a
 *   limiter you cannot consult is not a limiter"). A malformed-id/
 *   nonexistent-id/invalid-status 400/404 therefore isn't reachable over
 *   real HTTP in this environment; those cases are already exhaustively
 *   covered with a fake Redis in the Vitest suite. What real HTTP proves
 *   here instead is that a moderator-authenticated request that clears
 *   `auth` really does fail closed rather than silently succeeding.
 *
 * A moderator JWT is signed locally against the same `SUPABASE_JWT_SECRET`
 * `wrangler dev` loads from `.dev.vars`, the same way
 * `apps/api/test/helpers/fakeJwt.ts` does for the Vitest suite.
 */

const JWT_SECRET =
  process.env.E2E_SUPABASE_JWT_SECRET ??
  'xm9NRM47B37/2RT88AsL1l/ce2MNLRR8zYm1E0edV9Cj9hs8FK9lhSeOA9riwPZljG49Vwf3O/4FR2ed0QW+UA==';

async function signJwt(role: 'moderator' | 'admin' | undefined, sub: string): Promise<string> {
  const key = new TextEncoder().encode(JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: `${sub}@example.test`, app_metadata: role ? { role } : {} })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
}

test.describe('POST /api/reports/breeding-site', () => {
  test('missing turnstileToken → generic 403 before any upstream call', async ({ request }) => {
    const res = await request.post('/api/reports/breeding-site', {
      data: { lat: 23.78, lng: 90.4 },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error?.message).toBeTruthy();
    expect(body.error?.requestId).toBeTruthy();
    expect(JSON.stringify(body).toLowerCase()).not.toContain('stack');
  });

  test('turnstile runs before the schema check — an out-of-range lat still gets 403, not 400', async ({ request }) => {
    const res = await request.post('/api/reports/breeding-site', {
      data: { lat: 999, lng: 90.4, turnstileToken: 'not-a-real-token' },
    });
    expect(res.status()).toBe(403);
  });

  test('a well-formed anonymous submission gets a real 403 from Turnstile over the wire', async ({ request }) => {
    const res = await request.post('/api/reports/breeding-site', {
      data: { lat: 23.78, lng: 90.4, description: 'e2e boundary probe', turnstileToken: 'not-a-real-token' },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error?.message).toBeTruthy();
    expect(JSON.stringify(body).toLowerCase()).not.toContain('stack');
  });

  test('a disallowed CORS origin gets no Access-Control-Allow-Origin header', async ({ request }) => {
    const res = await request.post('/api/reports/breeding-site', {
      headers: { Origin: 'https://evil.example' },
      data: { lat: 23.78, lng: 90.4, turnstileToken: 'irrelevant' },
    });
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
  });
});

test.describe('PATCH /api/reports/breeding-site/:id/verify', () => {
  const wellFormedButNonexistentId = '11111111-1111-4111-8111-111111111111';

  test('no token → 401', async ({ request }) => {
    const res = await request.patch(`/api/reports/breeding-site/${wellFormedButNonexistentId}/verify`, {
      data: { status: 'verified' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error?.message).toBeTruthy();
  });

  test('authenticated, non-moderator role → 403 (never reaches rate-limit/Redis)', async ({ request }) => {
    const token = await signJwt(undefined, 'e2e-non-moderator');
    const res = await request.patch(`/api/reports/breeding-site/${wellFormedButNonexistentId}/verify`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'verified' },
    });
    expect(res.status()).toBe(403);
  });

  test('a valid moderator token that clears auth still fails closed (429) when Redis is unreachable', async ({
    request,
  }) => {
    const token = await signJwt('moderator', `e2e-moderator-${Date.now()}`);
    const res = await request.patch(`/api/reports/breeding-site/${wellFormedButNonexistentId}/verify`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'verified' },
    });
    // The rate-limit middleware runs after `auth`, before the handler,
    // and fails closed (429) rather than open when it cannot reach
    // Redis — this is the same guarantee `rate-limit.test.ts` exercises
    // with a fake, proven here against the real middleware chain.
    expect(res.status()).toBe(429);
    const body = await res.json();
    expect(body.error?.message).toBeTruthy();
    expect(JSON.stringify(body).toLowerCase()).not.toContain('stack');
  });
});
