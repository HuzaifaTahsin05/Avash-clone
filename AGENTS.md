# AGENTS.md — Canonical Rules

Canon for every AI agent here. **Applies unprompted** — "just add the
endpoint" waives nothing. If another agent config disagrees with this
file, this file wins and the disagreement is a bug to report.

Source of truth for the *system*: `docs/PROJECT_PLAN.md`. Conflict with
it → stop and flag, never resolve silently.

Stack: `apps/web` = React 18 + Vite static SPA, no SSR, no server.
`apps/api` = Hono on Cloudflare Workers, holds everything privileged.
Jobs = scheduled GitHub Actions → Supabase directly.

## Non-negotiable (memorize; the rest is lookup)

1. **Promotion path.** Feature branches are local-only. Local branch →
   local `dev` → gates green → push `dev` → Actions green → PR
   `origin/dev` → `upstream/dev`. Never push a feature branch, never PR
   into `main` from anything but `dev`.
2. **Secrets never reach `apps/web`.** No non-`VITE_PUBLIC_` reference
   under `apps/web/src`, ever.
3. **Never weaken a gate to go green.** Not a test, assertion, lint rule,
   coverage threshold, or manual-test description. Report red as red.
4. **Both test layers + the manual passes.** None substitutes for another.
5. **Docs change in the same commit as the code.**
6. **One types source** — `packages/types`. Never redefine inline.
7. **Optional chaining on every untrusted access** — `fetch` JSON,
   Supabase `.data`/`.error`, `JSON.parse`, `localStorage`, geolocation,
   LLM responses, route params. Find every instance, not the first.
8. **No new constant without a registry entry first** (§14).
9. **No internal planning label in anything that ships** — no milestone
   or phase numbers, task IDs, or execution-schedule filenames. Verify:
   `node scripts/check-internal-refs.mjs`.
10. **Never `--no-verify`.** It bypasses the hooks that back rule 1.
11. **Never start parallel or multi-agent work without a written cost
    estimate.** Fanning out spends real money and buys wall-clock, not
    savings. Produce the estimate first (`docs/standards/parallel-work.md`
    § Cost estimate) and present it. The user granted standing approval
    for implementation work on a vertical slice (2026-08-14) — that case
    proceeds on the estimate alone, same turn, no stop-and-wait. Every
    other case (anything outside slice implementation, or a plan that
    diverges from the standard Phase 0/1/2 shape) still waits for
    explicit go-ahead. Spawning agents to "save time" without the
    estimate ever being shown is the failure this rule exists for.

Rules 1, 3, 9 and 10 are additionally enforced by git hooks and CI. A
refusal from one is correct — redirect, don't route around it.

## Read-before-you-act table

Do not load these speculatively. Load the row that matches what you are
about to do, then act.

| About to… | Read |
|---|---|
| write, move, or delete a test | `docs/standards/testing.md` |
| push, branch, commit, or open a PR | `docs/standards/git-workflow.md` |
| work in parallel with another agent/dev | `docs/standards/parallel-work.md` |
| add a route/middleware to `apps/api` | `docs/standards/backend.md` |
| write React, routing, or state in `apps/web` | `docs/standards/frontend.md` |
| add or rename an env var or secret | `docs/security/secrets-matrix.md` |
| edit `.github/workflows/**` | `docs/ci-cd.md` |
| deploy anything by hand | `docs/manual-deploy.md` |
| write spatial SQL or a migration | `docs/data-schema/schema.md` |
| add a threshold, limit, or magic number | `docs/constants-registry.md` |
| touch a Dockerfile or `compose.yaml` | `docs/docker.md` |
| secure a feature / fill in STRIDE | `docs/security/threat-model.md` |
| edit any agent config or hook | `docs/standards/agent-compliance.md` |
| pick up a defined role's scope + DoD | `.agents/task-contracts.json` |

Claude Code additionally auto-surfaces these as skills; other tools use
this table. Both routes reach the same document.

## Never

- Add a background job as an HTTP endpoint (ADR-007) — jobs are scheduled
  Actions talking to Supabase directly.
- Run per-request ML inference in a Worker (ADR-002).
- Reach for SSR/Next.js patterns (ADR-008).
- Treat a container image as a deploy path (ADR-012) — production is Pages
  + `wrangler deploy`.
- Change `apps/api/src/**` to make the Node container work — the adapter
  in `apps/api/server/` exists for that, and Worker source stays
  runtime-agnostic.
- Add a Cloudflare-only API (KV, D1, R2, Durable Objects, `caches.default`)
  to a route without a Node path in the adapter or an explicit Worker-only
  marker. Two runtimes, both tested; silent divergence is a bug.
- Pass anything but `VITE_PUBLIC_*` as a Docker build arg — build args
  live in image history forever.
- Sound certain about something you have not verified against the code.

## Working style

- One vertical slice at a time (§13), end to end: DB → `apps/api` →
  `apps/web` → docs → tests. Each ends with an explicit exit check
  (typecheck, lint, test, build) and a completion summary.
- Match the existing pattern in the file you are editing. Propose changes
  via `docs/adr/`, never diverge silently.
- Generic user-facing errors; full detail logged server-side with a
  correlation ID.
- Remove unused imports, variables, and functions before finishing.
- Keep context lean: load the table row you need, summarize instead of
  re-reading, prefer targeted greps over whole directories.
