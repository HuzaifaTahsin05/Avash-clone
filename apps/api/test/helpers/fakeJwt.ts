import { SignJWT } from 'jose';

export const TEST_JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';

export interface SignTestJwtOptions {
  sub?: string;
  email?: string;
  role?: string;
  secret?: string;
  expiresInSeconds?: number;
  issuedAtSecondsAgo?: number;
}

/** Signs a Supabase-shaped access token fixture for auth tests. */
export async function signTestJwt(options: SignTestJwtOptions = {}): Promise<string> {
  const {
    sub = '11111111-1111-4111-8111-111111111111',
    email = 'user@example.com',
    role,
    secret = TEST_JWT_SECRET,
    expiresInSeconds = 3600,
    issuedAtSecondsAgo = 0,
  } = options;

  const key = new TextEncoder().encode(secret);
  const now = Math.floor(Date.now() / 1000) - issuedAtSecondsAgo;

  const jwt = new SignJWT({
    email,
    app_metadata: role ? { role } : {},
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds);

  return jwt.sign(key);
}
