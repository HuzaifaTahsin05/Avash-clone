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

Scaffold only, added ahead of the route bodies and page landing — the
automated matrix below documents what covers this slice once
implementation is complete; the manual checklist is empty pending an
integration pass. See `docs/features/weather-dashboard.md` for the full
technical detail.

### 8.1 Automated test matrix

| Layer | Location | Covers | CI gate |
|---|---|---|---|
| Vitest, `node` | `packages/geo/test/*.test.ts` (existing) | `parseBbox`/region-code helpers shared with the risk map, if any weather-specific parsing is added | `pnpm test` |
| Vitest, workerd | `apps/api/test/routes/weather.test.ts` (to be added with the route implementation) | `/api/weather/latest` and `/api/weather/history` success/failure branches, `days` clamping, missing-`regionCode` 400, Cache-Control header, CORS matrix | `pnpm test` |
| Playwright, `apps/api` (both runtimes) | `apps/api/e2e/weather.spec.ts` (this slice) | One schema-valid 200 per route, Cache-Control header set, disallowed-origin CORS rejection, one 400 path (missing `regionCode`) | `pnpm --filter api test:e2e`, `API_TEST_TARGET=container pnpm --filter api test:e2e` |
| Playwright, `apps/web` | `apps/web/e2e/weather.spec.ts` (this slice) | Page load, region selector population, region switch changing displayed values, sparkline render, generic error state with no raw error text on API failure | `pnpm --filter web test:e2e` |

### 8.2 Manual checklist (three-pass, `docs/standards/testing.md` §"Manual, three-pass protocol")

**Date:** _pending_ · **Tester:** _pending_ · **Reviewer sign-off:** _pending_

**Happy path**
1. Load `/weather` with a live `apps/api` and seeded `weather_observations` data. Expected: the region selector lists every seeded region; the first region's latest reading renders with no "no data" markers where data exists.
2. Select a different region from the selector. Expected: the latest-reading values and the sparkline both update to that region's data within one request cycle, no stale values left rendered.
3. Confirm the sparkline's date range matches `WEATHER_HISTORY_WINDOW_DAYS` (14 days back from the latest observation). Expected: the earliest point on the chart is within a day of 14 days before the latest point.

**Degraded path**
1. Stop `apps/api` (or point `VITE_PUBLIC_API_BASE_URL` at an unreachable host) and load `/weather`. Expected: a generic error state renders; no raw fetch error, stack trace, or unhandled promise rejection appears in the page or the browser console.
2. Point `apps/api` at an empty `weather_observations` table (fresh DB, `pnpm db:migrate` with no `pnpm db:seed`) and load `/weather`. Expected: an explicit empty state, not a blank page or a thrown error — the region selector may be empty or show a "no regions yet" message, but the page does not crash.
3. Load `/weather`, then use DevTools to go offline (or `context.setOffline(true)` equivalent) and switch region. Expected: an offline-specific message renders, distinct from the generic error state, consistent with the offline handling already proven for `/` in `apps/web/e2e/health-integration.spec.ts`.

**Adversarial path**
1. Call `GET /api/weather/history` (no `regionCode`) directly with `curl`. Expected: `400` with the generic error body (`{"error":{"message":...,"requestId":...}}`), no raw validation-library message.
2. Call `GET /api/weather/history?regionCode=dhaka&days=99999`. Expected: `200` with `windowDays` clamped to `14`, never `99999`.
3. Call `GET /api/weather/history?regionCode=<a UUID-looking but non-existent code>`. Expected: `200` with `points: []`, not a `500` or a leaked DB error — this is well-formed input for a region with no matching rows, not a malformed request.
4. Call either weather route from an unregistered `Origin` header (e.g. `https://evil.example`). Expected: no `Access-Control-Allow-Origin` header in the response.

## 9. Risk Map

Scaffold only, added ahead of the route bodies and page landing — the
automated matrix below documents what covers this slice once
implementation is complete; the manual checklist is empty pending an
integration pass. See `docs/features/risk-map.md` for the full technical
detail.

### 9.1 Automated test matrix

| Layer | Location | Covers | CI gate |
|---|---|---|---|
| Vitest, `node` | `packages/geo/test/geo.test.ts` (existing) | `parseBbox` — malformed, out-of-range, inverted, and over-`BBOX_MAX_SPAN_DEG` cases | `pnpm test` |
| Vitest, workerd | `apps/api/test/routes/risk-map.test.ts` (to be added with the route implementation) | `/api/risk-map` and `/api/risk/:regionId` success/failure branches, horizon validation, bbox validation, 404-vs-400 distinction, Cache-Control header, CORS matrix | `pnpm test` |
| Playwright, `apps/api` (both runtimes) | `apps/api/e2e/risk-map.spec.ts` (this slice) | One schema-valid 200 per route, Cache-Control header set, disallowed-origin CORS rejection, one 400 path (oversized bbox / malformed regionId), one 404 path (well-formed-unknown region) | `pnpm --filter api test:e2e`, `API_TEST_TARGET=container pnpm --filter api test:e2e` |
| Playwright, `apps/web` | `apps/web/e2e/risk-map.spec.ts` (this slice) | Map container mount, tile requests to the registered host, region polygon rendering, four-band legend, horizon toggle refetch, region click opening the detail panel, provenance banner visibility | `pnpm --filter web test:e2e` |

### 9.2 Manual checklist (three-pass, `docs/standards/testing.md` §"Manual, three-pass protocol")

**Date:** _pending_ · **Tester:** _pending_ · **Reviewer sign-off:** _pending_

**Happy path**
1. Load `/risk` with a live `apps/api` and seeded `risk_predictions`/`regions` data. Expected: the map renders centered on `MAP_DEFAULT_CENTER` at `MAP_DEFAULT_ZOOM`, every seeded region is shaded by its risk level, and the provenance banner is visible (predictions are seeded stubs, `modelVersion === 'stub-0.0.0'`).
2. Click a shaded region. Expected: the detail panel opens showing that region's name, risk score/level, and `isStub: true` reflected in the UI (e.g. the same "placeholder" language as the banner).
3. Toggle the horizon control from 2 weeks to 4 weeks. Expected: a new `/api/risk-map?horizon=4` request fires and the shading updates to the 4-week prediction; toggling back to 2 weeks re-fetches `horizon=2`.
4. Pan/zoom the map. Expected: OSM attribution stays visible at all times (tile usage policy requirement); no console errors from tile loading.

**Degraded path**
1. Stop `apps/api` and load `/risk`. Expected: a generic error state renders — no raw fetch error or stack trace anywhere in the page.
2. Point `apps/api` at a DB with `regions` seeded but no `risk_predictions` rows. Expected: the map renders with no shaded regions (an explicit empty state), not a crash; `generatedAt: null` in the response is handled without throwing.
3. Load `/risk` fully, then go offline and click a different region. Expected: an offline-specific message renders for the detail-panel fetch, distinct from the generic error state.

**Adversarial path**
1. Call `GET /api/risk-map?bbox=-180,-90,180,90` (spans far beyond `BBOX_MAX_SPAN_DEG`) directly with `curl`. Expected: `400` with the generic error body, no PostGIS/PostgREST error text.
2. Call `GET /api/risk-map?horizon=3` (not `2` or `4`). Expected: `400`, generic body.
3. Call `GET /api/risk/not-a-uuid`. Expected: `400`, generic body, no raw UUID-parser error.
4. Call `GET /api/risk/ffffffff-ffff-ffff-ffff-ffffffffffff` (well-formed, no matching region). Expected: `404`, generic body — distinct from the `400` cases above, and never a `500`.
5. Call any risk route from an unregistered `Origin` header. Expected: no `Access-Control-Allow-Origin` header in the response.
6. From the browser DevTools network tab, confirm no request the risk map issues carries a Supabase service-role key, a Gemini key, or any other non-`VITE_PUBLIC_` credential — the risk map is a public read path with no secret on the wire.
