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

| Variable | Exposure | Consumers |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | `apps/api`, GH Actions job scripts |
| `SUPABASE_JWT_SECRET` | server-only | `apps/api` (local JWT verification, ADR-009) |
| `VITE_PUBLIC_SUPABASE_URL` | client (`apps/web`) | citizen reads, Realtime subscriptions — real gate is RLS, not secrecy |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | client (`apps/web`) | citizen reads, Realtime subscriptions — real gate is RLS, not secrecy |
| `GEMINI_API_KEY` | server-only | `apps/api` routes, `scripts/jobs/news-scan.ts` |
| `OPENWEATHERMAP_API_KEY` | server-only | `scripts/jobs/weather-ingest.ts` |
| `UPSTASH_REDIS_REST_URL` | server-only | `apps/api` rate limiter |
| `UPSTASH_REDIS_REST_TOKEN` | server-only | `apps/api` rate limiter |
| `TURNSTILE_SECRET_KEY` | server-only | `apps/api` (server-side verification call) |
| `VITE_PUBLIC_TURNSTILE_SITE_KEY` | client | widget render only |
| `VITE_PUBLIC_MAPBOX_TOKEN` | client | scoped to a domain-restricted, read-only Mapbox token |
| `VAPID_PUBLIC_KEY` | client (`apps/web`) | Push subscription registration |
| `VAPID_PRIVATE_KEY` | server-only | `ml/serving/predict.py` (sends push notifications), never in any deployed app |

## How to set each secret per environment

| Environment | Mechanism |
|---|---|
| `apps/api` (Cloudflare Workers), local dev | `.dev.vars` file (gitignored) or `wrangler secret put <NAME>` for a deployed environment |
| `apps/api` (Cloudflare Workers), production/preview | `wrangler secret put <NAME> --env production` / `--env preview` (never committed to `wrangler.toml`) |
| `apps/web` (Cloudflare Pages) | `VITE_PUBLIC_*` vars only, set as Cloudflare Pages build environment variables (public by design — they end up in the client bundle regardless) |
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
