# ADR-001: Two-app split — `apps/web` (React SPA) + `apps/api` (Hono/Workers)

**Date:** 2026-08-01
**Status:** Accepted

## Context

The original brief assumed a Next.js-style single application where API
routes and server components live alongside the UI. That assumption was
corrected (see `docs/PROJECT_PLAN.md`'s correction log): the frontend is
React 18 + Vite — a plain client-rendered SPA with no server runtime of its
own. A React SPA cannot host secret-touching logic; whatever calls Gemini,
writes with the Supabase service-role key, verifies Turnstile tokens, or
enforces rate limits *must* run somewhere other than the browser.

**Rejected alternative:** keep a single Next.js-style app with API routes
colocated with the UI. Rejected because it reintroduces SSR (explicitly
ruled out, ADR-008) and couples deploy/scaling of the static asset layer to
the compute layer for no benefit at this project's scale.

**Rejected alternative:** put all secret-touching logic directly into
GitHub Actions job scripts only, with the browser talking to Supabase
directly via RLS for everything. Rejected because several operations
(Gemini calls, Turnstile verification, rate limiting) are inherently
per-request and need a low-latency, always-on request handler — a batch job
cannot serve that pattern.

## Decision

Split into two deployable units:
- `apps/web` — React 18 + Vite, a pure static SPA shipped to Cloudflare
  Pages. Contains zero server secrets.
- `apps/api` — Hono on Cloudflare Workers, the sole owner of all
  secret-touching, per-request logic (Gemini proxying, Supabase
  service-role writes, Turnstile verification, rate limiting, JWT
  verification).

## Consequences

**Easier:**
- `apps/web` becomes a pure, cacheable, CDN-friendly static bundle with a
  minimal attack surface (no server secrets to leak).
- `apps/api` becomes a small, auditable surface — every secret-touching
  code path lives in one place, reviewable against the §7 threat model.
- The two layers scale and deploy independently (`deploy-web.yml`,
  `deploy-api.yml`).

**Harder:**
- Every read/write the frontend needs now requires a documented contract
  (`packages/types`) and an extra network hop through `apps/api`, instead
  of calling Supabase directly for privileged operations.
- CORS becomes a first-class concern (`docs/PROJECT_PLAN.md` §7.2's
  Cross-Origin Surface threat) — a new class of misconfiguration that a
  single-app design would not have.
