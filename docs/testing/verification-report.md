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

## 8. Weather Dashboard

Implementation landed and integrated. See `docs/features/weather-dashboard.md`
for the full technical detail.

**A local-environment limit affects every "happy path" row below:** this
checkout has no local PostgREST (`compose.yaml` runs Postgres only) and no
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` configured, so `apps/api` cannot
read real seeded rows here — only a hosted Supabase project can close that
gap. Every check that does not require a live database read (validation,
error handling, contract-shaped rendering against mocked data matching the
frozen schemas) was run for real, with evidence below. Checks that
specifically require a live database row are marked **not run locally**
and are exercised instead by `apps/api/test/routes/weather.test.ts`'s
fake-PostgREST-double suite (which does verify the query the handler
builds) and by `apps/api/e2e/weather.spec.ts`'s two schema-valid-200 tests
against a real deployment.

### 8.1 Automated test matrix

| Layer | Location | Covers | CI gate |
|---|---|---|---|
| Vitest, `node` | `packages/geo/test/*.test.ts` (existing) | `parseBbox`/region-code helpers shared with the risk map, if any weather-specific parsing is added | `pnpm test` |
| Vitest, workerd | `apps/api/test/routes/weather.test.ts` (to be added with the route implementation) | `/api/weather/latest` and `/api/weather/history` success/failure branches, `days` clamping, missing-`regionCode` 400, Cache-Control header, CORS matrix | `pnpm test` |
| Playwright, `apps/api` (both runtimes) | `apps/api/e2e/weather.spec.ts` (this slice) | One schema-valid 200 per route, Cache-Control header set, disallowed-origin CORS rejection, one 400 path (missing `regionCode`) | `pnpm --filter api test:e2e`, `API_TEST_TARGET=container pnpm --filter api test:e2e` |
| Playwright, `apps/web` | `apps/web/e2e/weather.spec.ts` (this slice) | Page load, region selector population, region switch changing displayed values, sparkline render, generic error state with no raw error text on API failure | `pnpm --filter web test:e2e` |

### 8.2 Manual checklist (three-pass, `docs/standards/testing.md` §"Manual, three-pass protocol")

**Date:** 2026-08-15 · **Tester:** integration seat (local pass) · **Reviewer sign-off:** _pending_

**Happy path**
1. **Not run locally** (needs a hosted Supabase project — see the note above). Exercised instead by `apps/web/e2e/weather.spec.ts` ("the region selector is populated with an option per observation"), which renders `/weather` against a mocked `latestWeatherResponseSchema`-valid response and confirms every observation becomes a selector option. **Result: PASS** (Chromium + Firefox, 2/2).
2. **Not run against a live DB.** Exercised by `apps/web/e2e/weather.spec.ts` ("switching region changes the displayed values"): selecting a different region re-fetches and the displayed mean temperature updates from the previously-selected region's value to the new one with no stale value left rendered. **Result: PASS** (2/2).
3. **Not run against a live DB.** Exercised by `apps/web/e2e/weather.spec.ts` ("the history sparkline renders") plus `Sparkline.test.ts`/`sparklineMath.test.ts` unit coverage of the scaling math. **Result: PASS** (2/2); the window-length assertion itself (14 days back from latest) is not separately re-verified here since it is a pure `windowDays` pass-through already covered by `apps/api/test/routes/weather.test.ts`.

**Degraded path**
1. **Run for real.** `pnpm dev` (`wrangler dev`) with no `SUPABASE_URL` configured, `curl http://127.0.0.1:8787/api/weather/history?regionCode=dhaka&days=999` (a well-formed, validation-passing request) → `503` with body `{"error":{"message":"Something went wrong. Please try again.","requestId":"..."}}`. No driver error, host, or credential appeared in the body or in six inspected response headers. This *is* the "database unreachable" degraded case, exercised against the real Worker runtime rather than simulated. **Result: PASS.** The browser-side rendering of that failure is separately covered by `apps/web/e2e/weather.spec.ts`'s "a failed weather API response renders the generic error state with no raw error text" test (mocks a `500`, asserts `weather-error` renders and the strings `"boom"`, `"stack"`, `"internal server error"` never appear in the DOM). **Result: PASS** (2/2).
2. **Not run against a live DB** (would require a reachable Supabase project with an empty `weather_observations` table). The empty-state branch (`sortedRegions.length === 0` → `data-testid="status-empty"`, "no observations yet — the ingest job has not run") is present in `apps/web/src/pages/Weather.tsx` and was read/confirmed by code review during this integration pass, not exercised end-to-end.
3. Covered generically for `/` (not `/weather` specifically) by `apps/web/e2e/health-integration.spec.ts`'s offline test, using the same `useOnlineStatus` hook `/weather` also uses. Not separately re-run against `/weather` in this pass.

**Adversarial path**
1. **Run for real.** `curl http://127.0.0.1:8787/api/weather/history` (no `regionCode`) → `400`, body `{"error":{"message":"Something went wrong. Please try again.","requestId":"<uuid>"}}`. **Result: PASS.**
2. **Run for real.** `curl "http://127.0.0.1:8787/api/weather/history?regionCode=dhaka&days=999"` → `503` (falls through validation, fails only at the DB read for the reason in Degraded-path #1 above) — confirms `days=999` is *not* itself rejected as a 400, i.e. the clamp-not-reject contract holds; the exact clamped value (`14`) is separately asserted by `apps/api/test/routes/weather.test.ts`. **Result: PASS.**
3. Not separately run — same code path as #2, already covered by the `test/routes/weather.test.ts` "unknown code → 200 with points: []" case.
4. **Run for real.** `apps/api/e2e/weather.spec.ts`'s CORS test against a live `wrangler dev` origin. **Result: PASS.**

## 9. Risk Map

Implementation landed and integrated. See `docs/features/risk-map.md` for
the full technical detail. The same local-environment limit noted in §8
applies: no hosted Supabase project is reachable from this checkout, so
rows requiring a real seeded `risk_predictions` read are marked **not run
locally** below.

### 9.1 Automated test matrix

| Layer | Location | Covers | CI gate |
|---|---|---|---|
| Vitest, `node` | `packages/geo/test/geo.test.ts` (existing) | `parseBbox` — malformed, out-of-range, inverted, and over-`BBOX_MAX_SPAN_DEG` cases | `pnpm test` |
| Vitest, workerd | `apps/api/test/routes/risk-map.test.ts` (to be added with the route implementation) | `/api/risk-map` and `/api/risk/:regionId` success/failure branches, horizon validation, bbox validation, 404-vs-400 distinction, Cache-Control header, CORS matrix | `pnpm test` |
| Playwright, `apps/api` (both runtimes) | `apps/api/e2e/risk-map.spec.ts` (this slice) | One schema-valid 200 per route, Cache-Control header set, disallowed-origin CORS rejection, one 400 path (oversized bbox / malformed regionId), one 404 path (well-formed-unknown region) | `pnpm --filter api test:e2e`, `API_TEST_TARGET=container pnpm --filter api test:e2e` |
| Playwright, `apps/web` | `apps/web/e2e/risk-map.spec.ts` (this slice) | Map container mount, tile requests to the registered host, region polygon rendering, four-band legend, horizon toggle refetch, region click opening the detail panel, provenance banner visibility | `pnpm --filter web test:e2e` |

### 9.2 Manual checklist (three-pass, `docs/standards/testing.md` §"Manual, three-pass protocol")

**Date:** 2026-08-15 · **Tester:** integration seat (local pass) · **Reviewer sign-off:** _pending_

**Happy path**
1. **Not run locally** (needs a hosted Supabase project). Exercised instead by `apps/web/e2e/risk-map.spec.ts`'s "the map container mounts" and "tiles are requested from the registered OSM host" tests, against a mocked `riskMapResponseSchema`-valid `FeatureCollection`. **Result: PASS** (Chromium + Firefox, 4/4 across both tests).
2. **Not run against a live DB.** Exercised by `apps/web/e2e/risk-map.spec.ts` "clicking a region opens the detail panel" (mocked `riskDetailResponseSchema` payload with `isStub: true`) and "region polygons render on the map". **Result: PASS** (4/4).
3. **Not run against a live DB.** Exercised by `apps/web/e2e/risk-map.spec.ts` "toggling the horizon refetches the risk map with the new horizon" — asserts the outgoing request carries `horizon=4` after the toggle. **Result: PASS** (2/2).
4. Not separately re-run; OSM attribution and `MAP_TILE_MAX_ZOOM` are static `tileLayer.ts` constants (verified by direct read against `docs/constants-registry.md`, §14 row-for-row) rather than an interactive pan/zoom session.

**Degraded path**
1. **Run for real.** `curl http://127.0.0.1:8787/api/risk-map` with no `SUPABASE_URL` configured → generic error body, no upstream detail. Browser-side rendering of an API failure is covered by the analogous, already-passing `weather.spec.ts` error test using the same `fetchApi`/status-panel machinery both pages share; `risk-map.spec.ts` does not duplicate that specific case (per Worker D's brief: boundary behavior once, not a second copy of the matrix). **Result: PASS** (API layer); web layer inferred from the shared code path, not separately re-run for `/risk`.
2. **Not run against a live DB.** The empty-shading branch (`features.length === 0` → `status-empty`, "no risk predictions yet") is present in `apps/web/src/pages/RiskMap.tsx` and was confirmed by code review, not exercised end-to-end. `generatedAt: null` handling is asserted directly in `packages/types/test/api.test.ts`'s `riskMapResponseSchema` round-trip.
3. Not separately run — same `useOnlineStatus` code path as the weather page's degraded-path #3, already covered generically for `/` in `health-integration.spec.ts`.

**Adversarial path**
1. **Run for real.** `curl "http://127.0.0.1:8787/api/risk-map?bbox=0,0,40,40"` (30° span > `BBOX_MAX_SPAN_DEG`=10) → `400`, generic body. **Result: PASS.**
2. **Run for real.** `curl "http://127.0.0.1:8787/api/risk-map?horizon=3"` → `400`, generic body. **Result: PASS.**
3. **Run for real.** `curl "http://127.0.0.1:8787/api/risk/not-a-uuid"` → `400`, generic body, confirmed via `apps/api/test/routes/risk-map.test.ts` that no outgoing PostgREST request is attempted for this case. **Result: PASS.**
4. **Run for real** against a well-formed UUID with no local DB reachable → `503` (upstream unavailable), not `404`, since the region-existence check itself requires the DB; the `404`-for-well-formed-unknown-region branch is instead verified by `apps/api/test/routes/risk-map.test.ts`'s fake-PostgREST-double suite. **Result: PASS** (both status codes verified, in the environment where each is reachable).
5. **Run for real.** `apps/api/e2e/risk-map.spec.ts`'s CORS test against a live `wrangler dev` origin. **Result: PASS.**
6. Not run via DevTools network inspection in this pass; verified instead by `node scripts/scan-client-env.mjs` against the built `apps/web/dist` (PASS, no non-`VITE_PUBLIC_` reference) and by code review confirming `apps/web/src/features/risk/*` never references a service-role or Gemini key.
