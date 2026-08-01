# ADR-009: Supabase Auth + local HS256 verification via `jose`

**Date:** 2026-08-01
**Status:** Accepted

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
