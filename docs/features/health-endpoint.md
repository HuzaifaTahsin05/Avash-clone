# Health Endpoint

Follows the mandatory template from `docs/PROJECT_PLAN.md` §12.

**Gist:** `apps/api` is now a working Hono-on-Cloudflare-Workers API with
the full security middleware chain wired in front of a real `GET /health`
liveness endpoint. The endpoint is deliberately dependency-free — no
Supabase, no Gemini, no Upstash call happens anywhere in this request path
— so CI can exercise it without live database credentials.

**Technical Detail:**
- Middleware chain, applied in this exact order on every request
  (`docs/standards/backend.md`): `request-id` (`apps/api/src/middleware/request-id.ts`)
  → `security-headers` (`apps/api/src/middleware/security-headers.ts`) →
  `cors` (`apps/api/src/middleware/cors.ts`) → route handler → `onError`
  (Hono's top-level handler, wired to `handleError()` from
  `packages/logger`).
- `request-id` generates a `crypto.randomUUID()` per request, stores it in
  Hono context (`c.set('requestId', id)`), and returns it as the
  `X-Request-Id` response header on every response, success or failure.
- `security-headers` applies the full §7.4 set: `Strict-Transport-Security`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and
  `Permissions-Policy: geolocation=(self), notifications=(self)`.
- `cors` (`apps/api/src/config/cors.ts`) is a strict origin allow-list —
  the production Pages domain and the PR-preview subdomain pattern
  (`CORS_ALLOWED_ORIGINS`, §14). An unlisted origin gets **no**
  `Access-Control-Allow-Origin` header back at all, never a wildcard.
  `OPTIONS` preflights from a disallowed origin get a bare `403`.
  The allow-list is **deploy-time config, not a source-code literal**:
  `apps/api/wrangler.toml`'s `CORS_ALLOWED_ORIGINS` (comma-separated
  exact origins) and `CORS_PREVIEW_ORIGIN_SUFFIX` (bare domain suffix,
  matched against `^https://[a-z0-9-]+\.<suffix>$`) are typed Worker
  `Bindings` (`apps/api/src/types.ts`) read at request time — changing
  the allowed domain is a `wrangler.toml` edit, never a code change.
  Because Wrangler does not merge `[vars]` across environments, the pair
  is redeclared in `[vars]`, `[env.preview.vars]`, and
  `[env.production.vars]` identically.
- `GET /health` (`apps/api/src/routes/health.ts`) returns `{ status: "ok",
  version, environment, timestamp, requestId }`, parsed against
  `healthResponseSchema` (`packages/types/api.ts`, R3) before it is
  returned — the same schema `apps/web`'s `apiClient.ts` validates
  against. No DB call, no network call.
- `withErrorBoundary()` / `handleError()` (`packages/logger/index.ts`) log
  the full error (message, stack, correlation ID) server-side as
  structured JSON and return only `{ error: { message, requestId } }` to
  the caller — never a stack trace or internal detail (R10). The same
  `handleError()` backs both Hono's top-level `onError` and the unknown-route
  `notFound` handler in `apps/api/src/index.ts`.
- The structured logger (`packages/logger/index.ts`) redacts any object key
  matching a PII/secret pattern (`email`, `phone`, `password`, `token`,
  `secret`, `jwt`, `authorization`, `cookie`, `service_role`, `api_key`,
  `ssn`, `address`) at any depth before serializing a log line.
- `apps/api/src/types.ts` types the Hono app generically as
  `Hono<{ Bindings, Variables }>` — no `any` on `c.env`.
- `wrangler.toml` declares `[env.preview]` / `[env.production]`, enables
  `[observability]`, sets `compatibility_flags = ["nodejs_compat"]`, and
  lists the required secret names as a comment only — every real value is
  injected via `wrangler secret put` locally or a GitHub Actions secret in
  CI/CD (R2, `docs/security/secrets-matrix.md`). The two CORS vars are the
  only non-secret `[vars]` entries with real values, and those values are
  currently the placeholder domain `avash.pages.dev`
  (`docs/constants-registry.md`) pending a real Cloudflare Pages project.
- Tests live in `apps/api/test/`, mirroring `src/` (`test/routes/health.spec.ts`
  for `src/routes/health.ts`) — a dedicated top-level test directory, not
  colocated with source, consistent with `apps/web/e2e/`. Written with
  **Playwright**, not Vitest — `apps/api/playwright.config.ts` starts a
  real `wrangler dev` instance (`webServer`) and every spec except the
  error-boundary one issues a genuine HTTP request against it via the
  `request` fixture, matching how `apps/web`'s specs test the production
  preview rather than an in-process render. `apps/api` has a second
  `tsconfig.test.json` alongside its primary `tsconfig.json` specifically
  so Node's `process` global (needed by `playwright.config.ts`) never
  leaks into the Worker source's type-checking (`docs/standards/backend.md`).

**Liveness vs. readiness:** `/health` is a **liveness** probe only — it
answers "is the Worker running," not "is the database reachable." It
intentionally has zero external dependencies so the CI pipeline — which is
built before the database schema exists — never needs live Supabase
credentials to pass. The database schema work adds a separate, additive
`GET /health/db` **readiness** probe once the schema exists; nothing in
this file is rewritten to add it.

**Critical Constants:**

| Constant | Value | Defined in | Status |
|---|---|---|---|
| `CORS_ALLOWED_ORIGINS` | production Pages domain + PR preview pattern | `apps/api/wrangler.toml` (`CORS_ALLOWED_ORIGINS`, `CORS_PREVIEW_ORIGIN_SUFFIX` vars), read in `apps/api/src/config/cors.ts` | implemented |

**Security Considerations:**
- R2 (secrets never reach a client): zero real secret values exist
  anywhere in `apps/api`; `wrangler.toml`'s `[vars]` block lists secret
  *names* only, as a comment.
- R7 (no background job as an HTTP endpoint): no route under
  `/api/jobs/*` exists; `/health` and the API index (`GET /`) are the only
  two mounted routes.
- R10 (generic user-facing errors): proven with a dedicated Playwright
  case (`test/routes/health.spec.ts`) that throws inside a handler and
  asserts the response body contains neither the thrown message nor the
  string `"stack"`, while the server-side `handleError()` call still
  receives the full error and stack for logging. This one spec runs
  in-process against a throwaway Hono instance rather than the live
  `wrangler dev` server, since it would otherwise require a debug-only
  route that deliberately throws to exist in the real, deployed app.
- CORS allow-list proven with three Playwright cases issuing real HTTP
  requests against `wrangler dev`: a disallowed origin
  (`https://evil.example`) gets no `Access-Control-Allow-Origin` header;
  the exact allowed origin (`https://avash.pages.dev`) gets the matching
  header back; a preview-suffix origin (`https://pr-99.avash.pages.dev`)
  also gets the matching header back, proving the env-driven regex
  construction works, not just the exact-match path.
- Every response — success, 404, or 500 — carries `X-Request-Id`, so a
  user-reported failure can always be correlated to a server-side log
  line without exposing internal detail.

**Manual Test Log:** not yet run as a formal signed-off pass. The backend
scaffold's `curl` evidence (security headers, CORS rejection,
typed 404) stands in as the informal verification for this slice; the
formal, reviewer-signed three-pass log is completed as part of the
project's final verification sweep (`docs/standards/testing.md`). Last
pass test date: none.
