---
name: deploy
description: Use for anything touching deployment or credentials — running wrangler deploy or pages deploy, setting a secret, editing a deploy workflow, configuring GitHub Environments, adding an env var, or rolling back a release.
---

# Deploy

**Never deploy as a side effect of a coding task.** A deploy happens
because someone asked for one.

## Paths

Production ships via **Cloudflare Pages** (`apps/web`) and **`wrangler
deploy`** (`apps/api`). Container images are a portability artifact
(ADR-012) — no deploy workflow consumes one, ever.

`main` → production · `dev` → preview · PR → Pages preview only.

## Credentials

| Context | Mechanism |
|---|---|
| `apps/web` local | `apps/web/.env` — `VITE_PUBLIC_*` only |
| `apps/api` local | `apps/api/.dev.vars` |
| Jobs + `ml/` local | root `.env` |
| Workers deployed | `wrangler secret put <NAME> --env preview\|production` |
| CI | GitHub Actions secrets — migrating to per-environment scope |

All three local files are gitignored; the tracked `*.example` templates
are the inventory. Adding a var means updating its template,
`docs/PROJECT_PLAN.md` §7.1, and `docs/security/secrets-matrix.md` in the
same change.

**Never** interpolate `${{ secrets.X }}` into a `run:` body — read it
through `env:`. **Never** pass a non-`VITE_PUBLIC_` value as a Docker
build arg; build args live in image history forever.

## Build-time coupling to know about

Vite inlines `VITE_PUBLIC_*` at build time. A preview bundle and a
production bundle are **different artifacts from the same commit**, and a
preview build cannot be promoted to production. Build with the target
environment's values, verify that artifact, deploy that artifact.

## Before any manual deploy

Clean tree, right branch, then `pnpm lint && pnpm typecheck && pnpm test
&& pnpm build` by hand — a manual deploy skips every merge gate, so you
run them yourself. Note the SHA; every rollback needs it.

`wrangler deploy --dry-run` first, every time. Record the current
deployment ID before a production deploy — looking it up after a bad one
is slower and more stressful.

## Rollback

`wrangler rollback <id> --env production` restores **code only** — not
secrets, not `wrangler.toml` vars. Pages rolls back from the dashboard,
instantly, shipping already-verified bytes. Database has no rollback:
forward-fix, or restore from the backup you took first.

Per-service commands, verification, and first-time environment setup:
**`docs/manual-deploy.md`**. Pipeline, secrets table, and gate locations:
**`docs/ci-cd.md`**. Splitting credentials by environment:
**`docs/security/github-environments.md`**.
