# Verification Report

A point-in-time record of the project's full local verification sweep
(`docs/standards/testing.md`), run against the actual repository state
rather than assumed. Per-feature manual test logs live in each
`docs/features/*.md`; this report is the cross-cutting rollup.

**Date:** 2026-08-14

## 1. Pipeline gate

`pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build`, plus both Playwright suites, run in sequence against a clean checkout:

| Step | Result |
|---|---|
| `pnpm install --frozen-lockfile` | clean, lockfile already up to date |
| `pnpm lint` (`--max-warnings=0`) | pass, 0 warnings |
| `pnpm typecheck` | pass |
| `pnpm test:coverage` (Vitest — packages/* node, apps/api workerd, apps/web jsdom) | 7 test files, 54 tests, all pass; coverage thresholds met (see §2) |
| `pnpm build` | pass (web + api dry-run deploy) |
| `pnpm --filter web test:e2e` | 38/38 pass (19 specs × chromium + firefox), 3 consecutive runs, zero flakes |
| `pnpm --filter api test:e2e` | 5/5 pass against live `wrangler dev` |
| `packages/db` schema suite (`pnpm --filter @avash/db test:e2e`) | 19/19 pass against a live local PostGIS container; 19/19 explicit `skipped` (not falsely passed) when pointed at an unreachable host |

## 2. Coverage

Istanbul provider, thresholds are a merge gate (`vitest.config.ts`). All glob-scoped thresholds met on this run:

- `apps/api/src/routes/**`, `apps/api/src/middleware/**`: 100% stmts/branches/funcs/lines
- `packages/logger/**`: 93.33% stmts / 85% branches (threshold 90/85 — branch sits exactly at the floor)
- `packages/**`, `apps/api/src/**` (aggregate): well above the 70/60 floor
- Files at 0% (`geminiClient.ts`, `jwtVerify.ts`, `middleware/auth.ts`, `middleware/rate-limit.ts`, `middleware/turnstile.ts`, `packages/ml-inference/index.ts`) are documented placeholders for unbuilt vertical slices — not silently excluded, just not yet load-bearing enough to move the aggregate below threshold.

## 3. Security sweep

- `pnpm audit` (all deps): 28 findings, all inside **devDependencies** (`undici` via `wrangler`/`miniflare`/`@cloudflare/vitest-pool-workers` — dev/test tooling, never shipped).
- `pnpm audit --prod` (shipped deps only): **3 moderate findings, all `react-router-dom@6.30.4`** (open redirect / XSS via redirect, arbitrary constructor injection via SSR hydration deserialization). The fix is a major-version bump (patched only in the 7.x line); `apps/web` is a client-only SPA so the SSR-hydration finding does not apply to this app's actual usage, but the open-redirect finding is real. **Flagged for the user — see the final report** rather than silently upgraded, since a `6.x → 7.x` bump can change `react-router-dom`'s API surface (`router.tsx`, `RouteError.tsx`'s `useRouteError`) and deserves a deliberate decision, not an autonomous major-version jump.
- `node scripts/check-internal-refs.mjs`: PASS — no milestone/task-ID references in any shipped file.
- `node scripts/scan-client-env.mjs`: PASS — zero non-`VITE_PUBLIC_` env references in `apps/web/dist`.
- `node scripts/check-bundle-budget.mjs`: PASS — 103.56 KB gzip shell vs. 180 KB budget.
- Repo-wide secret-pattern grep (API keys, JWTs, private key headers, Slack tokens) across all tracked non-lockfile, non-doc files: no matches.
- `.github/workflows/codeql.yml`: present, wired into the gated pipeline graph, `security-and-quality` query suite across `javascript-typescript` + `python`. Its own comment documents that CodeQL's upload step requires GitHub Advanced Security (or a public repo) — a repository-settings prerequisite outside what any workflow file can satisfy, listed again in the final report's user-action list.

## 4. Curl-based attack pass (Pass 3 of the three-pass protocol)

Full case list and results: `docs/features/health-endpoint.md` § Manual Test Log. Summary: disallowed-origin CORS correctly gets no header on a GET and a bare `403` on preflight; oversized/wrong-method requests get generic `404`s before any processing; `/api/jobs/*` and `/jobs` are both `404` (R7); path traversal and CRLF header injection attempts are inert; unknown routes return the generic typed error shape with no stack trace; `/health/db` with no real Supabase credentials collapses to a generic `503` without leaking the real cause.

## 5. Cross-cutting rule audit

- **R2** (secrets never reach the client): `scan-client-env.mjs` PASS; `apps/api/src/lib/supabaseAdmin.ts` builds its client from Worker `env` only, never imported by `apps/web`.
- **R3** (one types source): `packages/types/domain.ts` and `packages/types/ml.ts` re-export from `@avash/db`; no interface is redefined inline in either app.
- **R4** (optional chaining / defensive access at untrusted boundaries): `apps/web/src/lib/apiClient.ts` guards `response?.ok`, `response.json?.()`, `parsed?.success`; `apps/api/src/routes/health.ts`'s `/health/db` path wraps the Supabase call in `try/catch` and never trusts `error` to be well-shaped before branching on it.
- **R5** (tested three ways): Vitest + Playwright + the manual three-pass protocol, all present and run this session; `.test.ts`/`.spec.ts` extension split verified by directory listing.
- **R9** (no magic numbers outside §14): the risk-band thresholds, the DB statement timeout, the MV refresh interval, and `API_CLIENT_TIMEOUT_MS` are all §14/`docs/constants-registry.md` entries, not inline literals.
- `pnpm dlx ts-prune --error`: no unused exports.

## 6. Lighthouse

Headless Chrome, mobile-emulation defaults, against `pnpm --filter web preview`: **Performance 99, Accessibility 100, Best Practices 96, SEO 82.** Gaps are pre-existing scaffold state (no meta description yet, `public/robots.txt` still the tracked 0-byte placeholder, `apps/api` intentionally not running during a frontend-only pass) — see `docs/features/frontend-scaffold.md` § Manual Test Log for detail. None required a code change.

## 7. What this report does not cover

- GitHub Environments, branch protection, and provisioned per-environment credentials — requires GitHub UI/API access this session does not have. Tracked in the project's final handoff report.
- A live deploy to Cloudflare Pages/Workers — no real Cloudflare account/zone is configured yet.
- `zizmor`, SBOM/provenance, and the remaining pipeline-hardening items — separate work item, not part of this verification sweep.
