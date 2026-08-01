# AGENTS.md — Instructions for AI Coding Agents

You are working inside Avash (আভাস). The file `docs/PROJECT_PLAN.md` (the
Engineering Blueprint) is the single source of truth. If your plan conflicts
with it, stop and flag the conflict instead of proceeding.

Frontend is React 18 + Vite (`apps/web`) — a static SPA, NOT Next.js. It has
no server. Anything that must stay secret or server-side belongs in
`apps/api` (Hono on Cloudflare Workers) or a GitHub Actions job script under
`scripts/jobs/` or `ml/serving/`.

## ALWAYS
- Implement end-to-end (DB → apps/api → apps/web → docs → tests) —
  one vertical slice at a time, per `docs/PROJECT_PLAN.md` §13.
- Keep sensitive data server-side only (§7.1). Before finishing any task
  touching secrets, grep `apps/web/src` to confirm no non-`VITE_PUBLIC_`
  variable was referenced.
- Use optional chaining / safe fallbacks on every external or untrusted data
  access point (§0.4). Find every instance — do not stop at the first one.
- Put all shared types/interfaces in `packages/types` — never redefine inline.
- Follow SOLID; be secure-by-default; enumerate attack vectors (§7.2 template)
  for any feature you touch, including CORS implications for cross-origin calls.
- Update docs in the same change as the code (§12). Include: gist, technical
  detail, critical constants table, security considerations.
- Write generic, user-friendly error/toast messages. Log full detail
  server-side with a correlation ID instead.
- Cover every behavior change with **both** automated tests — Vitest for
  `packages/*`/`apps/api` logic, Playwright end-to-end regression for
  `apps/web` — **and** the §10 three-pass manual protocol, with reviewer
  sign-off on the manual checklist. Manual testing is mandatory for any
  write-path or LLM-touching change; automated coverage never substitutes
  for it and vice versa. Run the passes and report the results.
- Match existing patterns in the file/module you are editing.
- Keep responses and working context lean — do not re-read files you already
  have full context on; summarize instead of re-pasting large blocks.
- Remove unused imports, variables, and functions before finishing a task.

## NEVER
- Expose a server-only secret to `apps/web` client code, ever.
- Introduce a regression, vulnerability, or break an existing feature to
  make a task "look done."
- Modify a test (or the 3-pass manual test description) to make a broken
  feature appear to pass.
- Sound certain about something you have not verified against this doc or
  the actual code.
- Add a background job as an HTTP endpoint on `apps/api` — jobs run via
  scheduled GitHub Actions connecting directly to Supabase (ADR-007).
- Implement per-request ML inference inside a Cloudflare Worker as if it
  were free of CPU-time constraints — see ADR-002.
- Reach for SSR/Next.js patterns; this is a client-rendered SPA (ADR-008).

## When modifying existing code
Match the existing pattern in that file/module exactly, even if you'd
personally choose differently. Raise a proposal in `docs/adr/` if you
believe the pattern itself should change — do not silently diverge.

## When securing a feature
Fill out the STRIDE-style vector list (Spoofing, Tampering, Repudiation,
Info Disclosure, DoS, Elevation of Privilege) for that feature before
writing code, per `docs/PROJECT_PLAN.md` §7.2's format. Add it to
`docs/security/threat-model.md`.

## Execution Discipline
Work proceeds one vertical slice at a time, per `docs/PROJECT_PLAN.md`
§13. Each slice ends with an explicit exit check (typecheck, lint, test,
build, and any slice-specific acceptance criteria) and a completion
summary, and requires explicit user confirmation before the next slice
begins. Do not start work that belongs to a later slice, do not skip an
acceptance check, and do not weaken a gate to force it green — report a
blocked task instead of substituting different work for it.
