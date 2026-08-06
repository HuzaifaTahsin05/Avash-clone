# CLAUDE.md — Dev Commands & Context Map

## Project Rules
- Always adhere to the architecture in `docs/PROJECT_PLAN.md`.
- No SSR. `apps/web` is a static SPA.
- All secrets live in `apps/api` (Cloudflare Workers) or GitHub Actions.
- **Never name an internal planning artifact in anything that ships** —
  no milestone/phase numbers, task IDs, execution-schedule filenames, or
  their section numbers, in code comments, docs, test names, workflow
  files, commit messages, or PR descriptions. Describe work by what it
  does (vertical-slice name from `docs/PROJECT_PLAN.md` §13, or a plain
  feature description). `§` references to `docs/PROJECT_PLAN.md` itself
  are fine — it ships; the planning files are gitignored and do not.
  Verify with `node scripts/check-internal-refs.mjs` (also a CI gate).

## Commands
1. `pnpm install` — install workspace deps
1b. `cp .env.example .env && cp apps/api/.dev.vars.example apps/api/.dev.vars && cp apps/web/.env.example apps/web/.env` — create the three gitignored local env files (see `docs/security/secrets-matrix.md`)
2. `pnpm --filter web dev` — Vite dev server for the React SPA
3. `pnpm --filter api dev` — `wrangler dev` for the Hono Worker API
  - `pnpm dev` — runs both dev servers concurrently via `turbo run dev`; use this instead of 2+3 in separate terminals unless you need one app in isolation
4. `pnpm lint` — turbo lint across both apps, run before every commit
5. `pnpm typecheck` — turbo typecheck across both apps, run before every commit
6. `pnpm build` — turbo build across both apps, run before every commit
7. `pnpm --filter @avash/security test` (and equivalently for other `packages/*`) — playwright for package logic (geo, security, ml-inference wrapper); also `pnpm --filter api test` (playwright against a live `wrangler dev`) and `pnpm --filter web test:e2e` (playwright against the production preview) — one test framework, three fixture profiles, see `docs/standards/testing.md`
7b. Local containers (optional — nothing above needs Docker; see `docs/docker.md`, ADR-011):
  - `pnpm docker:db` — start Postgres 15 + PostGIS on `127.0.0.1:54322` (`compose.yaml`); `docker:db:psql` for a shell, `docker:db:logs`, `docker:db:stop`, `docker:db:nuke` for a full wipe-and-reset
  - `pnpm docker:ml:build` then `pnpm docker:ml python ml/training/train.py` — run any `ml/` command in the pinned Python 3.11 image instead of a host install
  - `pnpm docker:apps:build` then `pnpm docker:apps` — build and run the two app images (ADR-012): web on `http://localhost:8080`, api on `http://localhost:8787`. `docker:apps:down` to stop
  - `pnpm docker:status` — prints every service's real URL when it's up, or the exact command to start it when it isn't (also runs automatically after `docker:db`, `docker:apps`, `docker:apps:down`, `docker:db:nuke`, `docker:ml:build`)
  - The app images are a portability artifact, not a deploy path — production still ships via Cloudflare Pages + `wrangler deploy`
8. `pnpm db:migrate` — apply `packages/db/supabase/migrations`
9. `pnpm db:seed` — `scripts/seed-db.ts` (regions, sample hospitals, historical cases)
10. `python ml/training/train.py` — retrain models (requires `ml/data` populated via DVC pull)
11. `python ml/training/export_onnx.py` — export + checksum the ONNX artifact into `packages/ml-inference`
12. `python ml/serving/predict.py` — run a batch inference pass locally (same script GH Actions runs on schedule)
13. `pnpm tsx scripts/jobs/weather-ingest.ts` — run the weather ingest job locally

## Where things live
- Read the full picture: `docs/PROJECT_PLAN.md` (this project's single source of truth), then `AGENTS.md` for hard rules.
- Types: `packages/types` only.
- Anything secret-touching: `apps/api/src/routes/*`, or `scripts/jobs/*` / `ml/serving/*` for cron work.
  `apps/web` never touches a secret — if you find yourself about to, stop.
- Env vars: three contexts, three files — `apps/web/.env` (`VITE_PUBLIC_*` only, ends up in the
  public bundle), `apps/api/.dev.vars` (Worker secrets, typed by `apps/api/src/types.ts`), and root
  `.env` (job scripts + `ml/`). All gitignored; the tracked `*.example` templates are the inventory.
  Adding a var means updating its template, `docs/PROJECT_PLAN.md` §7.1, and `docs/security/secrets-matrix.md`.
- Constants: never hardcode — check `docs/PROJECT_PLAN.md` §14 first (mirrored in `docs/constants-registry.md`).
- Containers: `compose.yaml` (`db`, `ml`, plus `web`/`api` behind the `apps` profile) and
  `docker/` for infra images (ADR-011); each app owns its own `apps/*/Dockerfile` (ADR-012).
  `apps/api`'s image runs on Node via the adapter in `apps/api/server/` — never edit
  `apps/api/src/**` to accommodate it, and remember CI tests that route on both runtimes.
  Runbook: `docs/docker.md`.
- Build order: `docs/PROJECT_PLAN.md` §13 governs the vertical-slice build order. It wins on any conflict.

## Context hygiene
Keep working context under ~40% capacity. Summarize prior findings instead
of re-reading whole files repeatedly. Prefer targeted greps/reads over
loading entire directories.
