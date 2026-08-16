# Git Workflow Standards

**Read when:** branching, committing, pushing, merging, or opening a PR — or when a hook refuses a command.

**Decides:** The promotion path, naming, the vertical-slice-per-PR rule, and the merge gate list.

## Hard rule: the promotion path

Feature branches are **local only**. Never push one to a remote, and never
open a PR from one. Never PR into `main` first.

The path from finished work to `upstream/main` is always:

1. Squash the feature branch's micro-task commits into one clean
   Conventional Commit (`git merge --squash <branch>`), then merge into
   local `dev` — locally, resolving any conflicts locally. (Reset local
   `dev` to `origin/dev` first if it's stale.) Keep a commit boundary
   unsquashed only when it is independently useful to bisect later — a
   migration landing separately from the code that consumes it, say.
   `dev`'s history reads as one change per slice, not a replay of every
   task checkpoint.
2. Test the GitHub workflows locally before anything leaves the machine
   (`actionlint` over `.github/workflows/`, plus the repo's own gates).
3. Push `dev` to `origin`.
4. Check the Actions run on `origin` and fix whatever it turns up. Do not
   move on while it is red.
5. Open a PR from `origin/dev` to `upstream/dev`.

The feature branch never appears on any remote at any point in this. If one
has already been pushed by mistake, close the PR and delete the remote branch
before continuing.

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
- [ ] Automated test evidence attached for **both** layers the change
      touches: Vitest (`packages/*`, `apps/api` in workerd, `apps/web`
      hooks) and Playwright (`apps/web` browser, `apps/api` dual-runtime
      contract). Coverage thresholds met, with no uncovered
      security-relevant branch.
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
7. Any failing Vitest test (`packages/*`, `apps/api` in workerd, `apps/web`
   hooks) or Playwright spec (`apps/web` browser, `apps/api` contract suite
   on either runtime) — no `continue-on-error`, no `|| true` anywhere in
   any workflow.
8. Any Vitest coverage threshold miss (`docs/standards/testing.md`
   § Coverage).
9. Any agent-governance drift — `scripts/agent-sync.mjs` flagging a
   per-tool agent config that has fallen out of sync with `AGENTS.md`
   (`docs/standards/agent-compliance.md`).
10. Any promotion-path violation — a PR opened from a feature branch, or a
    PR targeting `main` from anything but `dev`
    (§ Hard rule: the promotion path, above).

`deploy-web.yml` and `deploy-api.yml` only run after `ci.yml` and
`codeql.yml` are green **and** both container images have been built and
scanned clean. That is a real `needs:` edge in `pipeline.yml`, not a
convention — the deploy jobs cannot start until every gate above has
passed. It was previously only a convention: each workflow carried its own
`push: [main]` trigger, so a deploy could and did ship while the suite was
still running.

Neither deploy workflow re-runs the test suite, so the pipeline run on the
merge commit is the last point at which these gates can catch a regression.
