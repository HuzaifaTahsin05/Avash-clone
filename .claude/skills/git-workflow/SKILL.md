---
name: git-workflow
description: Use before any git or GitHub operation — branching, committing, pushing, merging, opening or reviewing a PR, or reacting to a rejected push. Invoke whenever a task is about to reach a remote or when a hook refuses a command.
---

# Promotion path

**Feature branches are local only.** Never push one, never open a PR from
one, never PR into `main` from anything but `dev`.

```
local feat/<slice>  →  local dev  →  gates green locally
   →  push dev to origin  →  Actions green on origin
   →  PR origin/dev → upstream/dev
```

Reset local `dev` to `origin/dev` first if it is stale. Resolve conflicts
locally, in `dev`, before pushing. If a feature branch already reached a
remote: close the PR, delete the remote branch, then continue.

Enforced by a `pre-push` hook and a CI gate. A refusal is correct —
redirect, never `--no-verify`.

## Before pushing `dev`

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
actionlint .github/workflows/*.yml    # if workflows changed
```

Push only when green. Then watch the Actions run and fix what it finds —
do not move on while it is red.

## Naming

| Branch | Commit type |
|---|---|
| `feat/<slice-name>` | `feat:` new capability |
| `fix/<issue>` | `fix:` bug fix |
| `docs/<area>` | `docs:` documentation only |
| `sec/<finding>` | `sec:` security fix or hardening |
| `ci/<area>` | `ci:` workflow/pipeline change |
| | `chore:` tooling, deps, config |

Scope where useful: `feat(api): add breeding report route`. Never name a
milestone, phase, or task ID in a branch, commit, or PR — describe the
work by what it does.

## One vertical slice per PR

Fully working end to end: DB → `apps/api` → `apps/web` → docs → manual
tests → automated tests. A schema-only or UI-only PR for a new feature is
rejected unless explicitly scoped as a foundation slice.

## PR must carry

- Linked slice/section of `docs/PROJECT_PLAN.md`
- Docs updated in the same PR (§12 template)
- Vitest evidence incl. coverage table, **and** Playwright evidence for
  every suite touched (both runtimes for `apps/api`)
- Three-pass manual log **with reviewer sign-off**, for any write-path or
  LLM-touching change
- STRIDE table for any write-path or auth-adjacent change

Merge gate list, review checklist, and the full rationale:
**`docs/standards/git-workflow.md`**. Working alongside other agents or
developers: `docs/standards/parallel-work.md`.
