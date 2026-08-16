import { describe, test, expect, vi, afterEach } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import { jwtVerify } from '../../src/lib/jwtVerify';
import { signTestJwt, TEST_JWT_SECRET } from '../helpers/fakeJwt';

const SUPABASE_URL = 'https://project.supabase.test';
const JWKS_PATH = '/auth/v1/.well-known/jwks.json';

const hs = { secret: TEST_JWT_SECRET, supabaseUrl: SUPABASE_URL };

/**
 * A real ES256 keypair, the way Supabase signs once a project moves to JWT
 * signing keys.
 *
 * Each signer gets its **own project URL**, because `jwtVerify` caches one
 * `createRemoteJWKSet` per URL for the lifetime of the module. Reusing one
 * URL across tests would hand the second test the first test's cached key
 * set — and `jose` will not refetch within its rotation cooldown, so the
 * test would fail for a reason that has nothing to do with what it asserts.
 * That caching is deliberate in production (one key set per project, and
 * the whole point of ADR-009 is not to fetch per request); it just has to
 * be given distinct keys here.
 */
let keyCounter = 0;
async function makeEs256Signer() {
  const n = (keyCounter += 1);
  const kid = `test-kid-${n}`;
  const baseUrl = `https://project-${n}.supabase.test`;
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const publicJwk = (await exportJWK(publicKey)) as JWK;

  return {
    kid,
    baseUrl,
    jwks: { keys: [{ ...publicJwk, kid, alg: 'ES256', use: 'sig' }] },
    async sign(claims: Record<string, unknown> = {}, expiresInSeconds = 3600) {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({ email: 'user@example.com', app_metadata: {}, ...claims })
        .setProtectedHeader({ alg: 'ES256', kid })
        .setSubject('11111111-1111-4111-8111-111111111111')
        .setIssuedAt(now)
        .setExpirationTime(now + expiresInSeconds)
        .sign(privateKey);
    },
  };
}

/** Serves a JWKS document at the URL jwtVerify derives from supabaseUrl. */
function stubJwks(jwks: unknown, baseUrl: string) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);
      if (url === `${baseUrl}${JWKS_PATH}`) {
        return new Response(JSON.stringify(jwks), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('jwtVerify — HS256 (legacy shared secret)', () => {
  test('accepts a validly signed, unexpired token', async () => {
    const token = await signTestJwt({ role: 'moderator' });
    const result = await jwtVerify(token, hs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe('11111111-1111-4111-8111-111111111111');
    }
  });

  test('rejects a token signed with the wrong secret', async () => {
    const token = await signTestJwt({ secret: 'a-completely-different-secret' });
    expect((await jwtVerify(token, hs)).ok).toBe(false);
  });

  test('rejects an expired token', async () => {
    const token = await signTestJwt({ expiresInSeconds: -3600 - 120 });
    expect((await jwtVerify(token, hs)).ok).toBe(false);
  });

  test('rejects a malformed token, never throws', async () => {
    expect((await jwtVerify('not-a-jwt', hs)).ok).toBe(false);
  });

  test('rejects an HS256 token when no secret is configured', async () => {
    const token = await signTestJwt({});
    const result = await jwtVerify(token, { supabaseUrl: SUPABASE_URL });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hs256_secret_not_configured');
  });

  test('never leaks a reason string suitable for the client — only a short label', async () => {
    const result = await jwtVerify('not-a-jwt', hs);
    if (!result.ok) {
      expect(result.reason.length).toBeLessThan(60);
    }
  });
});

describe('jwtVerify — ES256 (JWKS, what Supabase actually issues)', () => {
  test('accepts a token signed by the published JWKS key', async () => {
    const signer = await makeEs256Signer();
    stubJwks(signer.jwks, signer.baseUrl);

    const token = await signer.sign({ app_metadata: { role: 'admin' } });
    const result = await jwtVerify(token, { ...hs, supabaseUrl: signer.baseUrl });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe('11111111-1111-4111-8111-111111111111');
      expect((result.claims.app_metadata as { role?: string })?.role).toBe('admin');
    }
  });

  test('derives the JWKS URL from supabaseUrl, tolerating a trailing slash', async () => {
    const signer = await makeEs256Signer();
    const calls = stubJwks(signer.jwks, signer.baseUrl);

    const token = await signer.sign();
    const result = await jwtVerify(token, { supabaseUrl: `${signer.baseUrl}/` });

    expect(result.ok).toBe(true);
    expect(calls).toContain(`${signer.baseUrl}${JWKS_PATH}`);
  });

  test('rejects an expired ES256 token', async () => {
    const signer = await makeEs256Signer();
    stubJwks(signer.jwks, signer.baseUrl);

    const token = await signer.sign({}, -3600 - 120);
    expect((await jwtVerify(token, { ...hs, supabaseUrl: signer.baseUrl })).ok).toBe(false);
  });

  test('rejects a token signed by a key that is not in the published JWKS', async () => {
    const published = await makeEs256Signer();
    const attacker = await makeEs256Signer();
    stubJwks(published.jwks, published.baseUrl);

    const token = await attacker.sign();
    expect((await jwtVerify(token, { ...hs, supabaseUrl: published.baseUrl })).ok).toBe(false);
  });

  test('rejects when no supabaseUrl is configured — fails closed, never falls back to HS256', async () => {
    const signer = await makeEs256Signer();
    const token = await signer.sign();

    const result = await jwtVerify(token, { secret: TEST_JWT_SECRET });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('jwks_url_not_configured');
  });

  test('an unreachable JWKS endpoint fails closed rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const signer = await makeEs256Signer();
    const token = await signer.sign();

    const result = await jwtVerify(token, { ...hs, supabaseUrl: signer.baseUrl });
    expect(result.ok).toBe(false);
  });
});

describe('jwtVerify — algorithm handling', () => {
  test('rejects alg: none outright, before any key is consulted', async () => {
    // Hand-built: `jose` will not sign an unsecured JWT.
    const b64 = (o: unknown) =>
      btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      sub: '11111111-1111-4111-8111-111111111111',
      app_metadata: { role: 'admin' },
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}.`;

    const result = await jwtVerify(token, hs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsupported_algorithm');
  });

  test('an HS256 token signed with the JWKS public key is rejected — no algorithm confusion', async () => {
    // The classic attack: take the published *public* key and use its raw
    // bytes as an HMAC secret, hoping the server picks its verification
    // key by algorithm rather than by kind. It cannot work here because
    // the HS256 path only ever uses the separately configured
    // SUPABASE_JWT_SECRET, never anything derived from the JWKS — this
    // test is what keeps that property from being refactored away.
    const signer = await makeEs256Signer();
    stubJwks(signer.jwks, signer.baseUrl);

    const publicKeyBytes = new TextEncoder().encode(JSON.stringify(signer.jwks.keys[0]));
    const now = Math.floor(Date.now() / 1000);
    const forged = await new SignJWT({ app_metadata: { role: 'admin' } })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('attacker')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(publicKeyBytes);

    expect((await jwtVerify(forged, { ...hs, supabaseUrl: signer.baseUrl })).ok).toBe(false);
  });

  test('rejects an unsupported-but-real algorithm rather than defaulting somewhere', async () => {
    const b64 = (o: unknown) =>
      btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const token = `${b64({ alg: 'HS512', typ: 'JWT' })}.${b64({ sub: 'x' })}.signature`;

    const result = await jwtVerify(token, hs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsupported_algorithm');
  });
});
