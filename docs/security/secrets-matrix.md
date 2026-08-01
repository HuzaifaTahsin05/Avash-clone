# Secrets & Environment Matrix

Full environment variable inventory (`docs/PROJECT_PLAN.md` §7.1), with
exposure classification, consumers, how to set each in each environment,
and rotation procedure.

## The `VITE_PUBLIC_` prefix rule

Any environment variable **without** a `VITE_PUBLIC_` prefix must never be
imported into `apps/web` source. This is enforced by two independent
mechanisms — a deliberate double lock, not a single point of failure:

1. **ESLint boundary rule** (`packages/config/eslint-config`) — a
   `no-restricted-syntax` rule fails the build if any `import.meta.env` /
   `process.env` access appears anywhere under `apps/web/src` where the key
   does not start with `VITE_PUBLIC_`.
2. **Vite's default env-inlining behavior** — Vite itself refuses to
   inline non-`VITE_`-prefixed vars into the client bundle by default,
   independent of whether the ESLint rule catches the source-level
   reference.

A CI step additionally scans the **built** `apps/web/dist` output
for any accidentally-leaked secret value or non-public env key as a third,
defense-in-depth check against the compiled artifact rather than only
source code.

## Environment matrix

| Variable | Exposure | Consumers | Local file |
|---|---|---|---|
| `SUPABASE_URL` | server-only | `apps/api`, GH Actions job scripts, `ml/serving/predict.py` — same value as `VITE_PUBLIC_SUPABASE_URL`, read under this name server-side | `.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | `apps/api`, GH Actions job scripts | `apps/api/.dev.vars`, `.env` |
| `SUPABASE_JWT_SECRET` | server-only | `apps/api` (local JWT verification, ADR-009) | `apps/api/.dev.vars` |
| `VITE_PUBLIC_SUPABASE_URL` | client (`apps/web`) | citizen reads, Realtime subscriptions — real gate is RLS, not secrecy | `apps/web/.env` |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | client (`apps/web`) | citizen reads, Realtime subscriptions — real gate is RLS, not secrecy | `apps/web/.env` |
| `VITE_PUBLIC_API_BASE_URL` | client (`apps/web`) | base URL of the `apps/api` Worker, used by `apps/web/src/lib/apiClient.ts` | `apps/web/.env` |
| `GEMINI_API_KEY` | server-only | `apps/api` routes, `scripts/jobs/news-scan.ts` | `apps/api/.dev.vars`, `.env` |
| `OPENWEATHERMAP_API_KEY` | server-only | `scripts/jobs/weather-ingest.ts` | `.env` |
| `UPSTASH_REDIS_REST_URL` | server-only | `apps/api` rate limiter | `apps/api/.dev.vars` |
| `UPSTASH_REDIS_REST_TOKEN` | server-only | `apps/api` rate limiter | `apps/api/.dev.vars` |
| `TURNSTILE_SECRET_KEY` | server-only | `apps/api` (server-side verification call) | `apps/api/.dev.vars` |
| `VITE_PUBLIC_TURNSTILE_SITE_KEY` | client | widget render only | `apps/web/.env` |
| `VITE_PUBLIC_MAPBOX_TOKEN` | client | scoped to a domain-restricted, read-only Mapbox token | `apps/web/.env` |
| `VITE_PUBLIC_VAPID_PUBLIC_KEY` | client (`apps/web`) | Push subscription registration | `apps/web/.env` |
| `VAPID_PUBLIC_KEY` | server-only | `ml/serving/predict.py` — Web Push signing needs both halves of the keypair; same value as `VITE_PUBLIC_VAPID_PUBLIC_KEY` | `.env` |
| `VAPID_PRIVATE_KEY` | server-only | `ml/serving/predict.py` (sends push notifications), never in any deployed app | `.env` |

A client-consumed value must carry the `VITE_PUBLIC_` prefix **in its own
name** — both locks above key off the identifier, not off intent, so a
browser-bound value under a bare name is simply unreadable. That is why
the VAPID public key is listed twice, under two names for two consumers,
rather than once under a bare name (`docs/PROJECT_PLAN.md` §7.1 corollary).

## Local development files

Each runtime context loads its own gitignored file. Every one has a
committed `*.example` template that serves as the tracked inventory of
required keys — the templates are the only copies in version control, and
they never contain a real value.

| Context | Real file (gitignored) | Tracked template | Loaded by |
|---|---|---|---|
| `apps/web` browser bundle | `apps/web/.env` | `apps/web/.env.example` | Vite at build time — `VITE_PUBLIC_` keys only |
| `apps/api` Worker | `apps/api/.dev.vars` | `apps/api/.dev.vars.example` | `wrangler dev`, injected as the typed `Bindings` in `apps/api/src/types.ts` |
| Job scripts + `ml/` | `.env` (repo root) | `.env.example` | `scripts/jobs/*` and `ml/serving/*` when run locally |

Set up a fresh clone with:

```bash
cp .env.example .env
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.env.example apps/web/.env
```

`.gitignore` ignores `.env`, `.env.*`, `.dev.vars`, and `.dev.vars.*`
while re-including the `*.example` templates via negation. Following the
setup instructions therefore cannot result in a committed credential.
Verify at any time with:

```bash
git check-ignore -v .env apps/api/.dev.vars apps/web/.env
```

These files are **local development only**. No deployed environment reads
them — production and preview use the mechanisms in the next section.

## How to set each secret per environment

| Environment | Mechanism |
|---|---|
| `apps/api` (Cloudflare Workers), local dev | `apps/api/.dev.vars` (gitignored; copy from `.dev.vars.example`) |
| `apps/api` (Cloudflare Workers), production/preview | `wrangler secret put <NAME> --env production` / `--env preview` (never committed to `wrangler.toml`) |
| `apps/web` (Cloudflare Pages), local dev | `apps/web/.env` (gitignored; copy from `.env.example`) — `VITE_PUBLIC_*` only |
| `apps/web` (Cloudflare Pages), production/preview | `VITE_PUBLIC_*` vars only, set as Cloudflare Pages build environment variables (public by design — they end up in the client bundle regardless) |
| Job scripts + `ml/`, local dev | root `.env` (gitignored; copy from `.env.example`) |
| GitHub Actions (job scripts, CI, deploy workflows) | Repository or environment-scoped **GitHub Actions secrets**, referenced as `${{ secrets.NAME }}`, injected as ephemeral env vars into the runner |

`wrangler.toml`'s `[vars]` block lists every required secret name as a
**commented inventory only** — real values are never committed to the
repository under any circumstance (R2).

## Rotation procedure

1. Generate the new credential at the source (Supabase project settings,
   Gemini/Google Cloud console, OpenWeatherMap dashboard, Upstash console,
   Cloudflare Turnstile dashboard, or a freshly generated VAPID keypair).
2. Update the secret in every environment that consumes it, in this order,
   to avoid a window where the old credential is already revoked but the
   new one isn't live yet:
   a. GitHub Actions secret (repository or environment scope).
   b. `wrangler secret put` for each Cloudflare Workers environment
      (`preview`, `production`).
   c. Cloudflare Pages build environment variable, for any `VITE_PUBLIC_*`
      value that changed (requires a new deploy to take effect, since it's
      baked into the static bundle at build time).
3. Trigger a redeploy of `apps/api` (and `apps/web`, if a public var
   changed) so the new value is actually in use, not just stored.
4. Revoke/delete the old credential at the source **after** confirming the
   new one is live (health check, or a manual smoke test of the affected
   route).
5. Record the rotation date and reason in the incident/change log used by
   the team (not committed to this repository).

Any credential suspected of being compromised skips the "confirm new one
is live first" ordering — revoke immediately, accept a short window of
degraded service, then follow steps 1–3 to restore it.
