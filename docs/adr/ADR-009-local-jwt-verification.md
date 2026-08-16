# ADR-009: Supabase Auth + local JWT verification via `jose`

**Date:** 2026-08-01
**Status:** Accepted. **Amended 2026-08-16** — "HS256 against
`SUPABASE_JWT_SECRET`" is no longer the whole story; see the amendment at
the foot of this file. The core decision (verify locally, never round-trip
to Supabase Auth per request) is unchanged and is what the amendment
preserves.

## Context

Authenticated routes on `apps/api` (blood inventory updates, breeding
report verification, alert subscriptions, push subscriptions) need to know
who the caller is and, in some cases, their role. Supabase Auth issues
JWTs on login via its client SDK. The naive way to verify a bearer token
server-side is to round-trip to Supabase's Auth API on every authenticated
request to confirm validity — that adds a network hop and latency to every
protected route, and adds a hard dependency on Supabase Auth's own uptime
for every single request, not just login.

**Rejected alternative:** call Supabase Auth's `getUser()` (or equivalent)
endpoint on every authenticated request to `apps/api`. Rejected because it
doubles the network round-trips on every protected route (Worker → Supabase
Auth → Worker → Supabase Postgres) for a check that can be done locally.

## Decision

`apps/web` uses the Supabase Auth client SDK for login/session management
as normal. `apps/api` verifies the resulting HS256 JWT **locally**, using
the `jose` library against `SUPABASE_JWT_SECRET` (server-only,
`docs/PROJECT_PLAN.md` §7.1) — no round-trip to Supabase Auth on the
request path. `apps/api/src/lib/jwtVerify.ts` owns this logic; the
middleware chain's `auth` step (`docs/standards/backend.md`) calls it
before any route handler that requires an authenticated caller.

## Consequences

**Easier:** authenticated routes stay fast — one less network hop per
request — and do not add a dependency on Supabase Auth's availability
beyond the initial login. Verification logic is small, well-tested,
plain TypeScript.

**Harder:** `SUPABASE_JWT_SECRET` must be kept in sync with whatever
Supabase project the app points at, and rotated carefully — if the secret
rotates on the Supabase side without updating the Worker's environment,
every authenticated route starts rejecting valid tokens until it's fixed.
There is no live revocation check against Supabase on every request, so a
token remains locally "valid" until it expires even if the underlying
Supabase session were revoked out-of-band (an accepted trade-off given the
existing token expiry window).

---

## Amendment (2026-08-16): asymmetric signing keys

**What was wrong.** This ADR assumed Supabase signs access tokens with the
project's shared HS256 secret. That is no longer true by default. The
linked project publishes an **ES256** key at
`/auth/v1/.well-known/jwks.json`, and every token GoTrue issues carries
`{"alg":"ES256","kid":…}` — verified directly by minting a token for a
throwaway account and decoding its header, not inferred from the docs.

`jwtVerify` accepted `algorithms: ['HS256']` only, so **every genuinely
valid token was rejected**. The blast radius was every authenticated
route: `GET /api/admin/users` and `PATCH /api/admin/users/:id/role` (the
role administration UI), `PATCH /api/reports/breeding-site/:id/verify`
(the moderator verify/reject buttons), and `PATCH /api/resources/blood/:id`.
All returned 401, which the UI correctly renders as a generic "unable to
load" — so the symptom was two whole features appearing broken with no
indication of why.

Worth noting *why the tests did not catch this*: the fixtures sign their
own HS256 tokens, so they exercised the code path faithfully and passed.
Nothing in the suite asserted anything about the algorithm the real
identity provider actually uses. A green suite against a self-signed
fixture is not evidence about a third party's behaviour.

**Decision.** `jwtVerify` selects its verification path from the token's
own `alg` header:

- `HS256` → the legacy shared secret, as before. Kept because projects
  that have not migrated still use it, and because it is what the test
  fixtures sign.
- `ES256` / `RS256` → the project's published JWKS, fetched through
  `jose`'s `createRemoteJWKSet` and cached per project URL in a
  module-level map.

Anything else — including `alg: none` — is rejected before any key is
consulted.

**This does not reverse the original decision.** `createRemoteJWKSet`
fetches the key set once and serves it from memory, re-fetching only on an
unrecognised `kid` and rate-limited by its own cooldown. Verification
stays local and offline on the request path; there is still no per-request
round-trip to Supabase Auth, which is the entire point of this ADR. The
one new dependency is that the *first* verification after a cold start (or
after a key rotation) needs one reachable HTTPS call.

**On algorithm confusion.** Choosing a verification path from an
attacker-supplied header is the shape of a classic vulnerability: sign
`HS256` using the published *public* key as the HMAC secret and hope the
server picks its key by algorithm. It cannot work here, because the two
paths use unrelated key material — the HS256 path only ever uses the
separately configured `SUPABASE_JWT_SECRET`, never anything derived from
the JWKS. `apps/api/test/lib/jwtVerify.test.ts` asserts exactly that
forgery is rejected, plus `alg: none` and an unlisted-but-real algorithm,
so the property cannot be refactored away silently.

**Consequences.** `SUPABASE_JWT_SECRET` is now optional rather than
required for a project on asymmetric keys — but it is still listed as
required by `apps/api/server/node-server.ts`, deliberately: a project
mid-migration issues both, and starting without the secret would silently
reject the older half. `SUPABASE_URL` becomes load-bearing for auth, not
just for PostgREST; a Worker configured with the wrong project URL now
fails verification rather than merely failing queries.
