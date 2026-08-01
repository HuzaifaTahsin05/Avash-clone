# Backend Coding Standards

`apps/api` is a Hono application running on Cloudflare Workers. It is the
**only** place secret-touching, per-request logic is allowed to live
(ADR-001) — no background job ever runs as an HTTP endpoint here (R7,
ADR-007).

## Routing conventions

- **Route-file-per-domain:** each `apps/api/src/routes/*.ts` file owns one
  domain from `docs/PROJECT_PLAN.md` §6 — `risk-map.ts`, `resources.ts`,
  `reports.ts`, `symptom-check.ts`, `alerts.ts`. A route file never reaches
  into another domain's concerns; shared logic goes in `apps/api/src/lib/`
  or `packages/*`.
- Routes are mounted in `apps/api/src/index.ts`, which owns the
  middleware chain order and the route table — it is the only file that
  assembles the full app.
- Every route handler parses its input with a zod schema from
  `packages/types` before touching any data (zod-parse-on-entry, below) and
  parses its output against the corresponding response schema before
  returning.

## Middleware chain order

Applied in this exact order, on every request:

1. `request-id` — generates a correlation ID, stores it in context,
   returns it as `X-Request-Id` on every response.
2. `security-headers` — applies the full `docs/PROJECT_PLAN.md` §7.4
   header set to every response.
3. `cors` — strict origin allow-list (`CORS_ALLOWED_ORIGINS`, §14); unlisted
   origins get no CORS headers back, never a wildcard.
4. Route-specific middleware, in this sub-order where applicable:
   `auth` (JWT verification, ADR-009) → `turnstile` (anonymous write
   routes) → `rate-limit` (Upstash sliding window, §7.3).
5. The route handler itself.
6. `onError` (Hono's error handler, wired to `withErrorBoundary()`) —
   catches anything thrown anywhere above and returns a generic response.

This order is not arbitrary: `request-id` must exist before anything else
so every downstream log line and error response can be correlated;
`security-headers` and `cors` apply uniformly regardless of whether the
route ultimately succeeds or is rejected downstream; auth/turnstile/rate-limit
run before any handler touches the database or an external API, so a
rejected request never reaches privileged logic.

## `withErrorBoundary()` + correlation ID (R10)

Every route handler is wrapped in `withErrorBoundary()`
(`packages/logger`). On a thrown error, it:

1. Logs the full error (message, stack, request context) server-side as
   structured JSON, tagged with the request's correlation ID.
2. Returns a **generic**, user-safe JSON error body containing only the
   correlation ID and a non-specific message — never a stack trace,
   internal path, or dependency version.

Hono's top-level `onError` in `index.ts` uses the same helper as a final
backstop, so no unhandled exception can leak internal detail even if an
individual route forgets to wrap itself.

## Zod-parse-on-entry contract discipline

Every request body, query string, and route param that a handler reads is
parsed against a zod schema from `packages/types` **before** any business
logic runs. A parse failure returns a generic `400` (never echoing back
the malformed input verbatim) and never reaches the database or an
external API call. This is the same schema the `apps/web` `apiClient.ts`
uses to validate responses — one schema, two directions, imported from one
place (R3).

## Database access — Supavisor transaction-mode pooling

`apps/api/src/lib/supabaseAdmin.ts` connects via Supabase's **Supavisor**
transaction-mode pooler — never a long-lived direct Postgres connection.
Cloudflare Workers are stateless, short-lived invocations; holding a
persistent connection per-isolate would exhaust the connection pool under
load. Every query is expected to complete within the `DB_STATEMENT_TIMEOUT_S`
(5s, §14) enforced at the API role level.

## The R7 ban on `/api/jobs/*` endpoints

No route under `apps/api` may exist purely to be triggered as a background
job. Weather ingestion, batch prediction, and news scanning run as
scheduled GitHub Actions workflows connecting **directly** to Supabase with
the service-role key stored as a GitHub Actions secret (ADR-007). This is
enforced by review, not by tooling: any PR introducing a route under
`/api/jobs/*`, or any route whose only caller is a cron trigger, is
rejected.

## Defense in depth

Every authorization rule enforced by Postgres RLS is **also** checked in
the route handler before the query runs — RLS is the backstop, not the
only gate. Examples: blood inventory updates check
`verified_hospital_staff` membership in the handler in addition to RLS;
breeding-report verification checks the caller's role in the handler in
addition to RLS restricting the `update` policy to `moderator`/`admin`.
This means a misconfigured or accidentally-disabled RLS policy is not the
only thing standing between an unauthorized caller and a privileged write.
