---
name: hono
description: Use when writing or reviewing Hono routes, middleware, or the app entry under apps/api/src. Invoke for any change to apps/api routing, middleware chain, validation, or error handling.
---

# Hono-on-Workers Patterns for Avash

`apps/api` is the only place secret-touching, per-request logic runs
(ADR-001). Follow `docs/standards/backend.md` as the authoritative
reference; this skill is a condensed, task-time checklist.

## Middleware ordering — do not reorder this

`request-id` → `security-headers` → `cors` → route-specific
(`auth` → `turnstile` → `rate-limit`) → route handler → `onError`. Mounted
once in `apps/api/src/index.ts`. If a new middleware is needed, place it
by asking: does it need to run before CORS is applied to every response
(global concern), or only for specific privileged routes (route-specific,
after CORS)?

## Zod validation at the boundary

Every route handler parses its request body/query/params against a zod
schema from `packages/types` **before** any business logic — reject with a
generic `400` on mismatch, never echo the malformed input back. The same
schema is imported by `apps/web`'s `apiClient.ts` for response validation
— one schema, two directions, defined once (R3). Never write an inline
`interface`/type for a request or response body inside a route file.

## `withErrorBoundary()`

Wrap every route handler in `withErrorBoundary()` (`packages/logger`). It
logs the full error server-side with the request's correlation ID and
returns a generic user-safe JSON body — no stack trace, no internal path,
no dependency version ever reaches the response (R10). Hono's `onError` in
`index.ts` uses the same helper as a backstop.

## CORS allow-listing

Strict allow-list only, read from config — never `*`, never a wildcard on
write routes. An unlisted `Origin` gets **no** CORS header back at all
(not an explicit rejection header — just absence). Local dev origin
(`http://localhost:5173`) is allowed only in the development environment
config, never merged into the production list.

## The R7 no-jobs-endpoint rule

Never create a route whose only purpose is to be triggered by a scheduler
or external cron caller. Background work (weather ingest, batch predict,
news scan) runs as GitHub Actions workflows connecting directly to
Supabase (ADR-007) — if a task seems to want a `/api/jobs/*`-shaped route,
stop and flag it instead of building it.

## Supavisor pooling

Database access goes through Supabase's Supavisor transaction-mode pooler
(`apps/api/src/lib/supabaseAdmin.ts`) — never hold a long-lived connection
across invocations; Workers are stateless per-request.
