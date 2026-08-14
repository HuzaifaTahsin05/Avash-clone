# Risk Map

Follows the mandatory template from `docs/PROJECT_PLAN.md` §12.

**Gist:** A page at `/risk` shows a map of Bangladesh with each seeded
region shaded by its predicted dengue risk over the next few weeks, plus
a drill-down panel with the underlying prediction detail for a clicked
region. Right now every prediction on this map is a **placeholder** — a
seeded stub, not a trained model's output — and the page says so visibly.

**Technical Detail:**
- Data flow: predictions live in `risk_predictions`, summarized by the
  `region_risk_summary` materialized view, which the read view
  `region_risk_geojson`
  (`packages/db/supabase/migrations/20260215000009_api_read_views.sql`)
  turns into GeoJSON geometry plus a plain-numeric bounding envelope
  (`min_lon`/`min_lat`/`max_lon`/`max_lat`) — the four columns that make
  `?bbox=` expressible as ordinary PostgREST range filters, since
  PostgREST cannot itself express a bbox intersection or call
  `ST_AsGeoJSON`/`ST_SimplifyPreserveTopology`. Geometry is pre-simplified
  in SQL at `MAP_GEOMETRY_SIMPLIFY_TOLERANCE_DEG` so the map never ships
  full-resolution polygons to the browser.
- Two endpoints:
  - `GET /api/risk-map?bbox=&horizon=` reads `region_risk_geojson` and
    returns `riskMapResponseSchema` (`packages/types/api.ts`) — a GeoJSON
    `FeatureCollection` (`type`, `features`, `horizonWeeks`,
    `generatedAt` nullable, `requestId`). `horizon` defaults to
    `RISK_MAP_DEFAULT_HORIZON_WEEKS` (2) when omitted and must otherwise
    be exactly `2` or `4` (`horizonWeeksSchema`); anything else is a
    generic `400`. `bbox` is optional; when present it is validated by
    `parseBbox()` (`packages/geo/bbox.ts`) before use — malformed,
    out-of-range, inverted, or over-`BBOX_MAX_SPAN_DEG` values are all a
    generic `400`, with the specific reason logged server-side only, not
    returned to the client. `Cache-Control` is
    `s-maxage=300, stale-while-revalidate=600`.
  - `GET /api/risk/:regionId?horizon=` returns `riskDetailResponseSchema`
    — `{ regionId, regionCode, regionName, predictions: [],
    latestWeather (nullable), requestId }` for a single region's
    drill-down panel. `predictions` always carries **both** horizons
    (2-week and 4-week) regardless of `?horizon=` — the drilldown panel
    shows both at once, unlike the map, which shows one horizon at a
    time. `?horizon=` is still validated the same way as on `/api/risk-map`
    (anything other than `2`/`4` is a generic `400`) purely for input
    consistency across the two routes; it does not filter this response.
    A malformed UUID path param is a generic `400` before any query; a
    well-formed UUID with no matching region is a generic `404`.
    `latestWeather` reuses `weatherObservationDtoSchema`, tying the
    drill-down panel back to the same weather data shown on `/weather`.
- `apps/web`'s `/risk` page (`apps/web/src/pages/RiskMap.tsx`, lazy-loaded
  so the Leaflet chunk is not in the main bundle, §8) renders the map with
  Leaflet directly — **no `react-leaflet`** — over an OpenStreetMap raster
  basemap (ADR-013, no map credential required). Each region's polygon is
  shaded by `riskLevel` (`low`/`moderate`/`high`/`severe` — the
  `RISK_LEVEL_BANDS` thresholds from §14 are the SQL generated column on
  `risk_predictions`; `apps/web/src/features/risk/riskLevelBands.ts`
  carries the presentation for each band, a fill color plus a
  border-weight/dash-density signal so the encoding isn't color-only), a
  legend lists all four bands, and a horizon
  toggle (2 weeks / 4 weeks) refetches `/api/risk-map` with the new
  `?horizon=`. Clicking a region opens a detail panel backed by
  `/api/risk/:regionId`. The map opens centered at `MAP_DEFAULT_CENTER`
  (`[23.78, 90.40]`, Dhaka) at `MAP_DEFAULT_ZOOM` (7).
- **Every prediction is stubbed right now**, and the contract makes this
  checkable without guessing: `regionRiskPredictionSchema.isStub` is
  `true` exactly when `modelVersion === STUB_MODEL_VERSION`
  (`'stub-0.0.0'`, `packages/types/ml.ts`) — the sentinel the seed data
  writes and the real training pipeline's output will not carry once it
  lands (`docs/PROJECT_PLAN.md` §13, slice 3). The page renders a visible
  provenance banner ("predictions shown are placeholder / stubbed")
  unconditionally right now — the banner is marked in-code as a removal
  point for the slice that ships real predictions (`RiskMap.tsx`'s own
  comment names it), rather than being driven by `isStub` at render time;
  `isStub` is exposed on the wire for the drilldown panel and for any
  future per-region provenance UI, not consumed by the banner itself.
- **Tile allow-list — two files, one change.** The OSM tile host
  (`MAP_TILE_URL_TEMPLATE`, `apps/web/src/features/map/tileLayer.ts`,
  §14) is allow-listed under
  CSP `img-src` (not `connect-src` — Leaflet's raster `TileLayer` loads
  tiles as `<img>` elements) in **two** files that must be edited
  together or the two runtimes' headers diverge (ADR-012):
  `apps/web/public/_headers` (Cloudflare Pages, static deploy) and
  `apps/web/docker/security-headers.conf.template` (the Node/nginx
  container image). A change to the tile host that updates only one of
  these is an incomplete change.
- Edge cases handled by the contract: an empty `features: []` with
  `generatedAt: null` is a valid, well-typed response (no regions in the
  requested bbox, or no predictions generated yet) — the map renders an
  empty-but-not-broken state, not an error; `region_risk_geojson`'s
  `security_invoker = true` means the view runs under the querying
  role's own RLS rather than the view definer's, so it cannot silently
  bypass row-level security even though `apps/api` currently reads it
  with the service-role key.

**Critical Constants:**

| Constant | Value | Defined in | Purpose |
|---|---|---|---|
| `BBOX_MAX_SPAN_DEG` | 10 | `packages/geo/bbox.ts` | rejects an absurd viewport before it becomes a full-table scan |
| `MAP_GEOMETRY_SIMPLIFY_TOLERANCE_DEG` | 0.001 | `packages/db/supabase/migrations/20260215000009_api_read_views.sql` | polygon simplification in `region_risk_geojson`; ~100 m at this latitude, invisible at the zoom levels the map serves |
| `RISK_MAP_DEFAULT_HORIZON_WEEKS` | 2 | `packages/types/ml.ts` | horizon the map opens on when `?horizon=` is absent |
| `STUB_MODEL_VERSION` | `stub-0.0.0` | `packages/types/ml.ts` | sentinel marking seeded placeholder predictions; drives the `isStub` flag and the provenance banner |
| `MAP_DEFAULT_CENTER` | `[23.78, 90.40]` | `apps/web/src/features/map/tileLayer.ts` | initial map center (Dhaka) |
| `MAP_DEFAULT_ZOOM` | 7 | `apps/web/src/features/map/tileLayer.ts` | initial zoom — all seeded regions visible in one view |
| `MAP_TILE_URL_TEMPLATE` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | `apps/web/src/features/map/tileLayer.ts` | basemap tile source |
| `MAP_TILE_ATTRIBUTION` | `© OpenStreetMap contributors` | `apps/web/src/features/map/tileLayer.ts` | required by the OSM tile usage policy |
| `MAP_TILE_MAX_ZOOM` | 19 | `apps/web/src/features/map/tileLayer.ts` | highest zoom the OSM standard style serves |
| `RISK_MAP_CACHE_TTL_S` (`WEATHER_CACHE_TTL_S`'s risk-map counterpart) | `s-maxage=300, stale-while-revalidate=600` | `apps/api/src/routes/risk-map.ts` | edge cache behavior |

**Security Considerations:**

STRIDE analysis, mirrored into `docs/security/threat-model.md`:

- *Tampering:* a forged `bbox`/`horizon` value reaching a SQL query.
  Mitigated by `horizonWeeksSchema` and `parseBbox()` validation before
  any query runs, and PostgREST parameterizing every filter it builds
  from the validated values.
- *Information disclosure:* a PostgREST error body echoed to the client.
  Mitigated by `buildGenericErrorBody()` on every error branch, real
  error detail logged server-side keyed by `requestId`.
- *Denial of service:* an unbounded `bbox` (or a flood of requests)
  forcing a full scan. Mitigated by `BBOX_MAX_SPAN_DEG`, the existing 5 s
  DB statement timeout, and `region_risk_geojson` being a read over a
  materialized view — the spatial work (`ST_AsGeoJSON`,
  `ST_SimplifyPreserveTopology`) is already done before the request
  path, not computed per request.
- *Denial of service (OSM tile-policy violation):* bulk/rapid tile
  requests from many clients against the free, unauthenticated OSM
  tile service could look like abuse of that service. Partially
  mitigated today by `MAP_TILE_MAX_ZOOM` (bounding the request volume a
  single viewport can generate) and visible attribution
  (`MAP_TILE_ATTRIBUTION`, required by OSM's usage policy). **Checked and
  not yet present:** no `CacheFirst` service-worker/Workbox tile-caching
  policy exists in this repository yet (`docs/PROJECT_PLAN.md` §8
  describes one as the intended design, but no `vite-plugin-pwa`
  configuration or service worker registration was found under
  `apps/web` as of this writing) — this is an open gap, not a mitigated
  one, and is called out here rather than assumed done.
- *Information disclosure (basemap):* the browser requests tiles directly
  from OpenStreetMap's servers, disclosing the viewport to a third party.
  Accepted and bounded per the existing §7.2 analysis for the resource
  map: no identifier of ours travels with the tile request, and
  `Referrer-Policy: strict-origin-when-cross-origin` limits what the tile
  host learns from the referring page.
- *Spoofing:* none new — both risk-map routes are unauthenticated public
  reads with no identity to spoof. Stated explicitly rather than left
  silent.

**Open item — rate-limit column discrepancy (flagged, not resolved).**
Same discrepancy as the weather dashboard: `docs/PROJECT_PLAN.md` §6
lists `60/min/IP` for both risk routes while the actual middleware chain
is `cors, headers` only. Left open for the security-hardening slice.

**Manual Test Log:**

2026-08-15, integration pass. Full results and evidence in
`docs/testing/verification-report.md` §9.2. Summary: same shape as the
weather dashboard's log above — every check reachable without a hosted
Supabase project passed with direct evidence; DB-dependent happy-path rows
are marked "not run locally" and covered instead by
`apps/api/test/routes/risk-map.test.ts` and `apps/api/e2e/risk-map.spec.ts`.
One integration-time fix was needed and applied: the Playwright specs'
fixture UUIDs (`...-1111-1111-...`) failed zod's RFC4122 variant-nibble
check even though they were intended as sample data, not a security
finding — corrected to valid UUIDs. Reviewer sign-off pending.
