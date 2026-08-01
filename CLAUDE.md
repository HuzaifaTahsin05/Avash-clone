# CLAUDE.md — Dev Commands & Context Map

## Project Rules
- Always adhere to the architecture in `docs/PROJECT_PLAN.md`.
- No SSR. `apps/web` is a static SPA.
- All secrets live in `apps/api` (Cloudflare Workers) or GitHub Actions.

## Commands
1. `pnpm install` — install workspace deps
1b. `cp .env.example .env && cp apps/api/.dev.vars.example apps/api/.dev.vars && cp apps/web/.env.example apps/web/.env` — create the three gitignored local env files (see `docs/security/secrets-matrix.md`)
2. `pnpm --filter web dev` — Vite dev server for the React SPA
3. `pnpm --filter api dev` — `wrangler dev` for the Hono Worker API
  - `pnpm dev` — runs both dev servers concurrently via `turbo run dev` (M4-T09); use this instead of 2+3 in separate terminals unless you need one app in isolation
4. `pnpm lint` — turbo lint across both apps, run before every commit
5. `pnpm typecheck` — turbo typecheck across both apps, run before every commit
6. `pnpm build` — turbo build across both apps, run before every commit
7. `pnpm --filter @avash/security test` (and equivalently for other `packages/*`) — playwright for package logic (geo, security, ml-inference wrapper); also `pnpm --filter api test` (playwright against a live `wrangler dev`) and `pnpm --filter web test:e2e` (playwright against the production preview) — one test framework, three fixture profiles, see `docs/standards/testing.md`
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
- Build order: `docs/PROJECT_PLAN.md` §13 governs the vertical-slice build order. It wins on any conflict.

## Context hygiene
Keep working context under ~40% capacity. Summarize prior findings instead
of re-reading whole files repeatedly. Prefer targeted greps/reads over
loading entire directories.
