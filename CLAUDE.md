# CLAUDE.md — Commands & Context Map

Rules live in `AGENTS.md` (canon, read it). This file is commands and
where-things-are only — do not restate rules here.

## Commands

```bash
pnpm install                    # workspace deps
pnpm dev                        # both dev servers (turbo); --filter web|api for one

pnpm lint                       # eslint, --max-warnings=0
pnpm typecheck                  # tsc across both apps
pnpm test                       # Vitest: packages/*, apps/api (workerd), apps/web hooks
pnpm test:watch                 # Vitest watch;  test:coverage for the threshold gate
pnpm build                      # turbo build
pnpm --filter web test:e2e      # Playwright, real browser vs production preview
pnpm --filter api test:e2e      # Playwright contract suite vs wrangler dev
                                # API_TEST_TARGET=container → same specs, Node image

pnpm db:migrate                 # apply packages/db/supabase/migrations
pnpm db:seed                    # regions, hospitals, historical cases
pnpm tsx scripts/jobs/weather-ingest.ts

pnpm docker:db                  # Postgres 15 + PostGIS on 127.0.0.1:54322
pnpm docker:ml python ml/training/train.py     # pinned Python 3.11 image
pnpm docker:apps                # both app images: web :8080, api :8787
pnpm docker:status              # what's up, or the exact command to start it

python ml/training/train.py     # retrain (needs ml/data via DVC pull)
python ml/training/export_onnx.py
python ml/serving/predict.py
```

Pre-PR gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

Local env files (all gitignored, created from the tracked `*.example`
templates): `apps/web/.env` (`VITE_PUBLIC_*` only), `apps/api/.dev.vars`
(Worker secrets), root `.env` (jobs + `ml/`).

## Where things live

| | |
|---|---|
| Everything, authoritatively | `docs/PROJECT_PLAN.md` |
| Agent rules + the read-before-you-act table | `AGENTS.md` |
| Shared types | `packages/types` — only place |
| Secret-touching code | `apps/api/src/routes/*`, `scripts/jobs/*`, `ml/serving/*` |
| Constants | `docs/constants-registry.md` — check before hardcoding |
| Build order | `docs/PROJECT_PLAN.md` §13 — wins on conflict |
| Infra containers | `compose.yaml`, `docker/` |
| App images | `apps/*/Dockerfile`; Node adapter in `apps/api/server/` |

`.test.ts` is Vitest, `.spec.ts` is Playwright — the extension is
load-bearing.

## Context hygiene

Stay under ~40% capacity (≤100k tokens). Load the one `AGENTS.md` table
row that matches the task; do not preload standards docs. Summarize
findings instead of re-reading files.
