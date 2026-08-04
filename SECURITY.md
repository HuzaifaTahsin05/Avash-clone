# Security Policy

## Reporting

Report suspected vulnerabilities privately to the project maintainers —
do not open a public issue for unpatched security findings. Include a
description of the issue, reproduction steps, and affected component
(`apps/web`, `apps/api`, `packages/*`, job scripts, or the Supabase schema).

## Disclosure timeline

- **Acknowledgement:** within 3 business days of report.
- **Initial assessment (severity, affected scope):** within 7 business days.
- **Fix or mitigation:** critical/high findings targeted within 14 days of
  confirmation; medium/low findings scheduled into the next relevant
  vertical slice or hardening pass (`docs/PROJECT_PLAN.md` §13, slice 9).
- **Public disclosure:** coordinated with the reporter after a fix ships,
  never before.

## Supported Versions

| Component | Status |
|---|---|
| `main` branch (all apps/packages) | Actively supported — the only version this policy applies to |
| Any tagged release prior to the current `main` | Not supported — no backport patches; upgrade to `main` |

This project has no independently versioned release train yet; `main` is
the single deployable line of development.

## Scope

Covers `apps/web` (React SPA), `apps/api` (Hono/Cloudflare Workers),
`packages/*`, GitHub Actions job scripts (`scripts/jobs/`, `ml/serving/`),
and the Supabase schema in `packages/db`. The `ml/training` pipeline is out
of scope for runtime security, but its output (the ONNX artifact) is
checksum-verified before every inference run (§7.2 of `docs/PROJECT_PLAN.md`).

## Controls in place

- Row Level Security enabled on every Supabase table (§4.1 of `docs/PROJECT_PLAN.md`).
- Strict backend/frontend separation: `apps/web` ships zero server secrets;
  all privileged logic lives in `apps/api` or scheduled job scripts.
- Rate limiting (Upstash) on every write and LLM-touching `apps/api` route.
- Cloudflare Turnstile on all anonymous write endpoints.
- CORS allow-list restricted to known `apps/web` origins — no wildcard.
- CodeQL SAST on every PR + weekly scheduled scan.
- Dependabot for npm, pip, GitHub Actions, and Docker base-image ecosystems.
- Container images exact-pinned, built non-root, and scanned in CI (Trivy,
  high/critical fails the build); `.dockerignore` keeps `.env` / `.dev.vars`
  out of every build context. The published app images (ADR-012) carry no
  secret: `apps/web` takes only `VITE_PUBLIC_*` build args (public by
  definition), and `apps/api` reads every secret from the runtime
  environment, never from a build arg or a baked file.
- ESLint boundary rule + Vite's default env-inlining restriction as a double
  lock against secret leakage into the client bundle.
- Structured-output constraints and input sanitization on all Gemini calls
  (prompt-injection defense, §5.4).
- Background jobs run with no public HTTP trigger surface (ADR-007).

## Full threat model

See `docs/security/threat-model.md`, kept in sync with §7.2 of
`docs/PROJECT_PLAN.md`. Per-variable exposure classification lives in
`docs/security/secrets-matrix.md`; rate-limit and quota-guard specifics live
in `docs/security/rate-limiting.md`.
