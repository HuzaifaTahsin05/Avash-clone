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

- **Automated:** Vitest for `packages/*` and `apps/api` logic; Playwright
  end-to-end regression for `apps/web`. Both run in CI (`ci.yml`).
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
Vitest and/or Playwright run output/summary pasted here.

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
