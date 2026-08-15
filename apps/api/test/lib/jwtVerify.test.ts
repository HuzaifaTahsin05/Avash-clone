import { describe, test, expect } from 'vitest';
import { jwtVerify } from '../../src/lib/jwtVerify';
import { signTestJwt, TEST_JWT_SECRET } from '../helpers/fakeJwt';

describe('jwtVerify', () => {
  test('accepts a validly signed, unexpired token', async () => {
    const token = await signTestJwt({ role: 'moderator' });
    const result = await jwtVerify(token, TEST_JWT_SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe('11111111-1111-4111-8111-111111111111');
    }
  });

  test('rejects a token signed with the wrong secret', async () => {
    const token = await signTestJwt({ secret: 'a-completely-different-secret' });
    const result = await jwtVerify(token, TEST_JWT_SECRET);
    expect(result.ok).toBe(false);
  });

  test('rejects an expired token', async () => {
    const token = await signTestJwt({ expiresInSeconds: -3600 - 120 });
    const result = await jwtVerify(token, TEST_JWT_SECRET);
    expect(result.ok).toBe(false);
  });

  test('rejects a malformed token, never throws', async () => {
    const result = await jwtVerify('not-a-jwt', TEST_JWT_SECRET);
    expect(result.ok).toBe(false);
  });

  test('never leaks a reason string suitable for the client — only a short label', async () => {
    const result = await jwtVerify('not-a-jwt', TEST_JWT_SECRET);
    if (!result.ok) {
      expect(result.reason.length).toBeLessThan(60);
    }
  });
});
