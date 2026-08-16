import { jwtVerify as joseJwtVerify } from 'jose';

/** `JWT_CLOCK_TOLERANCE_S` (§14) — leeway for clock skew vs. Supabase's issuer. */
const JWT_CLOCK_TOLERANCE_S = 60;

export type JwtVerifyResult =
  | { ok: true; claims: Record<string, unknown> }
  | { ok: false; reason: string };

/**
 * Verifies a Supabase-issued access token with the project's JWT secret
 * (HS256, ADR-009). `jose` rather than `node:crypto` — the Worker must
 * stay runtime-agnostic (baseline fact 11) and `jose` runs unchanged on
 * both workerd and the Node adapter.
 *
 * Never throws: `reason` is a short label for the server log only and
 * must never reach the client (R10) — the caller (the `auth` middleware)
 * turns this into a generic 401.
 */
export async function jwtVerify(token: string, secret: string): Promise<JwtVerifyResult> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await joseJwtVerify(token, key, {
      algorithms: ['HS256'],
      clockTolerance: JWT_CLOCK_TOLERANCE_S,
    });
    return { ok: true, claims: payload as Record<string, unknown> };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.name : 'verification_failed' };
  }
}
