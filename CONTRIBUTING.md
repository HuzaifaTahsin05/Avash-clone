# Contributing

Avash (আভাস) is built as a strict sequence of vertical slices against
`docs/PROJECT_PLAN.md`. This document tells you how to get a change merged
without breaking that discipline.

1. Read `docs/PROJECT_PLAN.md` fully before your first PR — it is the source
   of truth for architecture, schema, constants, and security rules. If code
   and the plan disagree, the plan wins until updated in the same PR.
2. One vertical slice per PR (`docs/PROJECT_PLAN.md` §13). No partial DB-only
   or UI-only PRs for a new feature unless explicitly scoped as a foundation
   slice.
3. Know which app you're in: `apps/web` (React SPA, no secrets, ever) vs
   `apps/api` (Hono/Workers, all privileged logic) vs job scripts
   (`scripts/jobs/`, `ml/serving/`, run by GitHub Actions on a schedule).
4. Commits follow Conventional Commits (see the type table below).
5. Before opening a PR, the local pre-PR gate must pass for both apps:
   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```
6. PR description must include everything in the PR template
   (`.github/PULL_REQUEST_TEMPLATE.md`) filled out — see the template body
   below.
7. Do not modify a test, a lint rule, or a manual-test description to force a
   broken feature to "pass."
8. Both apps ship container images (ADR-012), but Cloudflare Pages /
   `wrangler deploy` remains how production ships — never wire an image
   into a deploy workflow. If your change touches an `apps/api` route,
   remember it must work on **both** runtimes (workerd and Node); CI runs
   the API suite against each. See `docs/docker.md`.

## Terminology

Work is described by what it does, not by a project-management label.
Use the vertical-slice name (`docs/PROJECT_PLAN.md` §13) or a plain
feature description in commits, PR titles/descriptions, code comments,
and docs — e.g. "frontend scaffold" or "breeding-site reporting," not
"Milestone 2" or "M2." Numbered milestone/phase labels and references to
internal planning documents (execution schedules, task-tracker exports,
etc.) do not belong in anything that ships with the repo: they go stale
the moment the plan is re-sequenced, and they force a reader to go find
the planning document to understand a commit that should be
self-explanatory. If you're pulling from an external planning doc when
drafting a PR, translate its scope into a feature description before it
lands in the repo — don't carry the label over.

## Branch naming

| Prefix | Use |
|---|---|
| `feat/<slice-name>` | New vertical-slice feature work (`docs/PROJECT_PLAN.md` §13) |
| `fix/<issue>` | Bug fix, no behavior addition |
| `docs/<area>` | Documentation-only change |
| `sec/<finding>` | Security fix or hardening pass |

## Conventional Commits

| Type | Use |
|---|---|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `chore:` | Tooling, dependencies, config, no behavior change |
| `ci:` | CI/CD workflow changes |
| `sec:` | Security-specific fix or hardening |

Scope the commit where useful, e.g. `feat(api): add breeding report route`.

## Testing requirement (§10)

Every PR ships **both** automated tests and the manual protocol — neither
substitutes for the other:

- **Automated:** Playwright for everything — `packages/*` and `apps/api`
  logic (`pnpm test`), and end-to-end regression for `apps/web`
  (`pnpm --filter web test:e2e`). One test framework repo-wide, no
  Vitest; see `docs/standards/testing.md` for the three fixture profiles
  (in-process, real HTTP against `wrangler dev`, real browser). All run
  in CI (`ci.yml`).
- **Manual, three-pass:** Pass 1 (assume not implemented — graceful
  degradation), Pass 2 (assume implemented correctly — happy path), Pass 3
  (assume full of bugs/security flaws — actively attack it). See
  `docs/standards/testing.md` for the full protocol and the worked example.
  **Manual testing is mandatory** for any PR touching a write path or an
  LLM-touching feature, and the three-pass checklist must be filled out in
  the PR description **and signed off by the reviewer** before merge.

## Local pre-PR gate

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four must pass locally before you open a PR. CI (`ci.yml`) re-runs this
same sequence plus the Playwright end-to-end stage — a local pass does not
replace a green CI run, but a local failure means CI will fail too.

**Docker is not required for any of it.** The gate above, `pnpm dev`, and
both apps run entirely on the host.

## Local infrastructure (optional)

Two things are containerized because they are painful to install by hand
and easy to get subtly wrong per-machine (ADR-011, full runbook in
`docs/docker.md`):

```bash
pnpm docker:db          # Postgres 15 + PostGIS on 127.0.0.1:54322
pnpm docker:db:nuke     # wipe the volume for a guaranteed-clean reset
pnpm docker:ml:build && pnpm docker:ml python ml/training/train.py
```

Use the database container for anything touching migrations, RLS policies,
or spatial queries — it beats pointing a destructive `db:reset` at a shared
Supabase project, and CI runs the same image. Use the ML image for anything
under `ml/`: it installs the same pinned `ml/requirements.txt` the scheduled
job does, so a locally exported ONNX artifact is the one the schedule would
have produced.

A hosted Supabase project and a host Python install are equally valid
substitutes for both.

## App images (ADR-012)

```bash
pnpm docker:apps:build   # build avash-web:local and avash-api:local
pnpm docker:apps         # run both: web on :8080, api on :8787
pnpm docker:apps:down    # stop them
```

These exist for portability and handover — running the stack without a
Node toolchain or a Cloudflare account. They are **not** how production
deploys. Two things to keep in mind when you touch either app:

- **`apps/web`'s image is environment-specific.** Vite inlines
  `VITE_PUBLIC_*` at build time, so the API base URL is a build argument
  and a different backend means a different image. Only `VITE_PUBLIC_*`
  values may ever be build args — build args live in image history.
- **`apps/api` runs on two runtimes.** The image serves the same Hono app
  through `@hono/node-server`; production runs workerd. CI runs the API
  Playwright suite against both. A route reaching for a Cloudflare-only
  API needs a Node path in the adapter or an explicit Worker-only marker
  on its spec — never a silent divergence.

## PR template body

Copy this into your PR description (also enforced via
`.github/PULL_REQUEST_TEMPLATE.md`):

```md
## Slice / Section
Linked slice number (`docs/PROJECT_PLAN.md` §13) or section reference.

## Summary
What changed and why, in 2-3 sentences.

## Docs updated
- [ ] Feature doc in `docs/features/*.md` (§12 template: Gist / Technical
      Detail / Critical Constants / Security Considerations / Manual Test Log)
- [ ] `docs/data-schema/schema.md` and/or `docs/data-schema/rls-policies.md`
      (if schema changed)
- [ ] `docs/constants-registry.md` (if a new constant was introduced)
- [ ] N/A — no behavior change

## Automated test evidence
Playwright run output/summary pasted here.

## Manual test log (three-pass, §10)
### Pass 1 — Assume not implemented
<observed behavior>

### Pass 2 — Assume implemented correctly
<observed behavior>

### Pass 3 — Assume full of bugs/security flaws
<observed behavior, attacks attempted>

**Reviewer sign-off:** <reviewer name — confirms the three passes above were
independently verified before merge>

## Security vectors considered
STRIDE table (Spoofing / Tampering / Repudiation / Info Disclosure / DoS /
Elevation of Privilege) for any write-path or auth-adjacent change — mirror
`docs/PROJECT_PLAN.md` §7.2's format. Write "N/A — read-only, no new surface"
if genuinely not applicable.
```

## What reviewers check

- Linked slice/section of `docs/PROJECT_PLAN.md`.
- Docs updated in the same PR as the code (§12 format).
- Test log present: automated evidence **and** all three manual passes,
  with reviewer sign-off recorded before approval.
- Security vectors considered for any write-path or auth-adjacent change.
- No non-`VITE_PUBLIC_` env access introduced under `apps/web/src` — grep
  for raw `.property` access on untrusted data per `docs/PROJECT_PLAN.md` §0.4.
