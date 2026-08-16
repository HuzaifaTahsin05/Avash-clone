import { jwtVerify as joseJwtVerify, createRemoteJWKSet, decodeProtectedHeader } from 'jose';

/** `JWT_CLOCK_TOLERANCE_S` (§14) — leeway for clock skew vs. Supabase's issuer. */
const JWT_CLOCK_TOLERANCE_S = 60;

/**
 * The asymmetric algorithms Supabase signs with when a project uses JWT
 * signing keys. Listed explicitly rather than "anything not HS256" so a
 * token arriving with `alg: none`, or some algorithm we have not
 * considered, is rejected rather than routed somewhere by default.
 */
const ASYMMETRIC_ALGORITHMS = ['ES256', 'RS256'] as const;

export type JwtVerifyResult =
  | { ok: true; claims: Record<string, unknown> }
  | { ok: false; reason: string };

export interface JwtVerifyOptions {
  /**
   * Legacy shared secret, used only for `HS256` tokens. Optional: a
   * project migrated to asymmetric signing keys may no longer issue any.
   */
  secret?: string;
  /**
   * Supabase project URL. The JWKS endpoint is derived from it, so the
   * Worker needs no separate variable to configure. Required to verify an
   * asymmetric token.
   */
  supabaseUrl?: string;
}

/**
 * `createRemoteJWKSet` fetches the key set once and then serves it from
 * memory, re-fetching only when it sees an unknown `kid` (rate-limited by
 * its own cooldown). Keeping one instance per URL is what makes that cache
 * effective — a fresh instance per request would fetch per request and
 * reintroduce exactly the round-trip ADR-009 exists to avoid.
 *
 * Module-level state here is safe, unlike in `supabaseAdmin.ts` where it
 * is explicitly forbidden: that module builds a client holding the
 * service-role key, so a cached instance could leak one request's
 * credentials into another. This cache is keyed by URL and holds nothing
 * but **public** verification keys — there is no secret to leak, and two
 * requests with different `env` get different entries.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(supabaseUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const url = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`;
  const cached = jwksCache.get(url);
  if (cached) {
    return cached;
  }
  const jwks = createRemoteJWKSet(new URL(url));
  jwksCache.set(url, jwks);
  return jwks;
}

/**
 * Verifies a Supabase-issued access token (ADR-009, as amended for
 * asymmetric signing keys). `jose` rather than `node:crypto` — the Worker
 * must stay runtime-agnostic (baseline fact 11) and `jose` runs unchanged
 * on both workerd and the Node adapter.
 *
 * Two paths, chosen by the token's own `alg` header:
 *
 *  - **`HS256`** → the legacy shared `SUPABASE_JWT_SECRET`. This is what
 *    the project used originally and what the test fixtures still sign.
 *  - **`ES256`/`RS256`** → the project's published JWKS. Supabase now
 *    signs with an asymmetric key by default, and a Worker configured only
 *    with the legacy secret rejects every genuinely valid token — a 401 on
 *    every authenticated route, which is precisely how this was found.
 *
 * Selecting on the header is safe here because the two paths use
 * unrelated key material: the HS256 path uses a configured secret that is
 * never derived from the JWKS. The classic algorithm-confusion attack —
 * signing HS256 using the *public* key as the HMAC secret — therefore has
 * nothing to work with. An `alg` outside the two lists (including `none`)
 * is rejected before any key is consulted.
 *
 * Never throws: `reason` is a short label for the server log only and
 * must never reach the client (R10) — the caller (the `auth` middleware)
 * turns this into a generic 401.
 */
export async function jwtVerify(token: string, options: JwtVerifyOptions): Promise<JwtVerifyResult> {
  let algorithm: string | undefined;
  try {
    algorithm = decodeProtectedHeader(token)?.alg;
  } catch {
    return { ok: false, reason: 'malformed_header' };
  }

  try {
    if (algorithm === 'HS256') {
      if (!options?.secret) {
        return { ok: false, reason: 'hs256_secret_not_configured' };
      }
      const { payload } = await joseJwtVerify(token, new TextEncoder().encode(options.secret), {
        algorithms: ['HS256'],
        clockTolerance: JWT_CLOCK_TOLERANCE_S,
      });
      return { ok: true, claims: payload as Record<string, unknown> };
    }

    if (algorithm && (ASYMMETRIC_ALGORITHMS as readonly string[]).includes(algorithm)) {
      if (!options?.supabaseUrl) {
        return { ok: false, reason: 'jwks_url_not_configured' };
      }
      const { payload } = await joseJwtVerify(token, getJwks(options.supabaseUrl), {
        algorithms: [...ASYMMETRIC_ALGORITHMS],
        clockTolerance: JWT_CLOCK_TOLERANCE_S,
      });
      return { ok: true, claims: payload as Record<string, unknown> };
    }

    return { ok: false, reason: 'unsupported_algorithm' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.name : 'verification_failed' };
  }
}
