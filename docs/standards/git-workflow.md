# Git Workflow Standards

## Branch naming

| Prefix | Use |
|---|---|
| `feat/<slice-name>` | New vertical-slice feature work (`docs/PROJECT_PLAN.md` §13) |
| `fix/<issue>` | Bug fix, no behavior addition |
| `docs/<area>` | Documentation-only change |
| `sec/<finding>` | Security fix or hardening pass |
| `ci/<area>` | CI/CD workflow or pipeline change |

## Conventional Commits

| Type | Use |
|---|---|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `chore:` | Tooling, dependencies, config, no behavior change |
| `ci:` | CI/CD workflow changes |
| `sec:` | Security-specific fix or hardening |

## Vertical-slice-per-PR rule (§13)

One feature, fully working end-to-end (DB → `apps/api` → `apps/web` →
docs → 3 manual tests → automated tests), before starting the next. A PR
that only touches the database schema for a not-yet-built feature, or only
the UI for a feature with no backing API, is rejected unless it is
explicitly scoped as a **foundation slice** (e.g., a docs-only governance
PR, or a schema-only migration PR that a later PR in the same slice will
build on within the same work session).

## Review checklist

- [ ] PR is scoped to one vertical slice — no unrelated changes bundled in.
- [ ] Docs updated in the same PR as the code (§12 template: Gist /
      Technical Detail / Critical Constants / Security Considerations /
      Manual Test Log).
- [ ] **Grep for raw `.property` access on untrusted data** — every
      access point in the `docs/PROJECT_PLAN.md` §0.4 / §9 checklist uses
      optional chaining or an equivalent safe-access pattern. Do not stop
      at the first instance found; find every one.
- [ ] No non-`VITE_PUBLIC_` env reference introduced under `apps/web/src`.
- [ ] No interface/DTO/zod schema redefined outside `packages/types`.
- [ ] Every new hardcoded constant/threshold is added to
      `docs/PROJECT_PLAN.md` §14 and `docs/constants-registry.md` first.
- [ ] No unused imports, variables, or functions left behind.
- [ ] Automated test evidence (Playwright — `packages/*` logic, `apps/api`, and/or `apps/web` end-to-end) attached.
- [ ] Three-pass manual test log present for any write-path or
      LLM-touching change, with reviewer sign-off recorded.
- [ ] STRIDE security-vectors section filled in for any write-path or
      auth-adjacent change.
- [ ] No test, lint rule, or manual-test description was weakened to
      force a gate green.

## Merge gate list (§11)

CI (`ci.yml`, called by `pipeline.yml`) fails the build — and therefore
blocks merge — on:

1. Any ESLint error **or warning** (`--max-warnings=0`).
2. Any TypeScript error.
3. Any unused export flagged by `ts-prune`.
4. Any CodeQL high/critical finding (`codeql.yml`).
5. A model checksum mismatch, for any PR touching an ML artifact.
6. Any client bundle referencing a non-`VITE_PUBLIC_`-prefixed env var
   (scanned directly against the built `apps/web/dist` output, not only
   caught by lint — defense in depth).
7. Any failing Playwright spec (`packages/*`, `apps/api`, or `apps/web`)
   — no `continue-on-error`, no `|| true` anywhere in any workflow.

`deploy-web.yml` and `deploy-api.yml` only run after `ci.yml` and
`codeql.yml` are green **and** both container images have been built and
scanned clean. That is a real `needs:` edge in `pipeline.yml`, not a
convention — the deploy jobs cannot start until every gate above has
passed. It was previously only a convention: each workflow carried its own
`push: [main]` trigger, so a deploy could and did ship while the suite was
still running.

Neither deploy workflow re-runs the test suite, so the pipeline run on the
merge commit is the last point at which these gates can catch a regression.
