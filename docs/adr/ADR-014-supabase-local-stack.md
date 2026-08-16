# ADR-014: The Supabase CLI's containerized local stack is the local database target

**Date:** 2026-08-16
**Status:** Accepted. **Amends [ADR-011](ADR-011-docker-for-infra-not-apps.md)** — specifically
its "Rejected alternative — Supabase CLI's local stack instead of a plain
PostGIS container", which deferred this decision with the words *"it
remains the right tool once Auth/Storage/Realtime need local exercising."*
That condition is now met. ADR-011's plain `db` service is **not**
removed; see Decision below for which one is used when.

## Context

"On a local or Docker run, use the local database; on deploy, use
Supabase" was not achievable with what the repo had, and the gap was
invisible because nothing failed loudly.

`apps/api` does not connect to Postgres. It talks to **PostgREST**, over
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
(`apps/api/src/lib/supabaseAdmin.ts`), which is what makes it deployable
to a Worker with no TCP connection pool. `apps/web` likewise talks to
**GoTrue** (auth) and **Realtime** (ADR-010) directly, over
`VITE_PUBLIC_SUPABASE_URL`.

The `db` service from ADR-011 is a bare `postgis/postgis` container. It
speaks Postgres and nothing else — no PostgREST, no GoTrue, no Realtime.
So it was reachable only by `packages/db`'s migration runner and the seed
script, both of which use `pg` over TCP. **Every request from a locally
running `apps/api` or `apps/web` went to the hosted Supabase project**,
including on `pnpm docker:apps`, where the stack looks entirely local.
Development traffic, seed writes, and any destructive experiment landed
on the same project a deploy serves from.

Two further things forced the issue:

1. **RBAC has no local test path without GoTrue.** The role mechanism is
   `app_metadata.role` signed into a JWT by Supabase Auth. The
   `01-auth-shim.sql` stand-in provides `auth.uid()`/`auth.jwt()` reading
   a *manually set* session variable, which is enough to test the *shape*
   of an RLS policy and nothing else. Verifying that a real sign-in
   produces a token carrying the role, that `PATCH
   /api/admin/users/:id/role` actually changes it, and that RLS then
   behaves differently — none of that is reachable without real Auth.
2. **The shim is a second schema definition that can drift.**
   `auth.users` in `01-auth-shim.sql` has two columns. Real GoTrue's has
   thirty-odd. A migration referencing any of the others applies locally
   and fails on deploy.

## Decision

**The Supabase CLI's local stack is the local target for anything that
speaks to the application's data plane.** It is containerized —
`supabase start` is a Docker orchestrator; it pulls and runs Postgres +
PostGIS, PostgREST, GoTrue, Realtime, Storage, and Kong as containers on
the local Docker daemon. It is wired into this repo's own scripts
(`pnpm docker:supabase`), configured by a tracked `supabase/config.toml`,
and reads the same `packages/db/supabase/migrations/` the hosted project
does.

Both local databases stay, with a clear split:

| Use | Target | Command |
|---|---|---|
| Running the app locally (`pnpm dev`, `pnpm docker:apps`) | Supabase CLI stack | `pnpm docker:supabase` |
| Migration/RLS/spatial-SQL iteration with no app running | ADR-011 `db` container | `pnpm docker:db` |
| CI schema jobs | ADR-011 `db` container (unchanged) | GitHub Actions `services:` |

The plain container remains genuinely better for the second case: it
starts in seconds rather than a minute, and `pnpm db:reset` against it
cannot touch anything that matters. It is no longer the *only* option,
which is what made it wrong.

**Environment selection is by value, not by branching code.** No app
source learns which target it is pointed at:

- Local: `SUPABASE_URL=http://127.0.0.1:54321` and the CLI-issued
  anon/service keys, in `.env` / `apps/api/.dev.vars` / `apps/web/.env`.
- Deployed: the hosted project URL and keys, from Cloudflare Pages build
  settings, `wrangler secret`, and GitHub Actions secrets.

This is the whole switch. It keeps ADR-001's "one app object, no runtime
branching" property — a config-driven target cannot drift from a
code-driven one because there is no code.

## Consequences

**Easier.** A local run is genuinely local: sign-up, sign-in, role
grants, RLS, and Realtime all work offline and against disposable data.
The RBAC slice becomes testable end to end. Destructive schema work
stops being one mistyped variable away from the hosted project. New
contributors get a working database with real Auth from one command and
no credentials.

**Harder.** The local stack is ~10 containers and roughly 3 GB of images
— a real cost on a small laptop, which is exactly what ADR-011 objected
to, and why the light `db` container is kept rather than replaced. The
CLI pins its own Postgres version independently of
`POSTGIS_LOCAL_IMAGE`, so parity is now something to *check* (documented
in `docs/docker.md` § Parity) rather than something the pin guarantees.
The CLI must be run through the repo's pinned `supabase` devDependency,
never a globally installed one, or its version drifts per machine.

**Not yet verified end to end.** The configuration, scripts, and docs are
in place and the CLI demonstrably reads them — it creates the database
container with exactly the image and port `config.toml` specifies — but
under Supabase CLI 2.114 on Windows with Docker Desktop, `supabase start`
hangs at `Starting database...` and never brings the stack up. See
`docs/docker.md` § Local Supabase stack for the full symptom, what was
ruled out, and the Windows-specific framing. **This decision is Accepted
on its merits; the claim "a local run is genuinely local" is therefore
aspirational until that blocker clears.** Until then the environment
split is real but only one side of it has been exercised, and local runs
continue to reach the hosted project — which is exactly the problem this
ADR exists to solve, so it should not be considered closed.

**Unchanged.** Production is still Cloudflare Pages + `wrangler deploy`
(ADR-012); the local stack is a development target and never a deploy
path. Jobs still talk to Supabase directly (ADR-007). `01-auth-shim.sql`
stays for the plain `db` container, now explicitly scoped to
policy-shape testing only.
