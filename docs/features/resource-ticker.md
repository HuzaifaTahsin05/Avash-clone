# Resource Ticker

Follows the mandatory template from `docs/PROJECT_PLAN.md` §12.

**Gist:** A page at `/resources` shows nearby hospitals' blood-bank stock
for a chosen blood group, with unit counts updating live as verified
hospital staff report changes — no page refresh needed. A second, simpler
read (`GET /api/resources/hospitals`) lists hospitals in a map viewport for
any future map-overlay use.

**Technical Detail:**

- Three endpoints:
  - `GET /api/resources/hospitals?bbox=` — reads the `hospital_locations`
    view (`packages/db/supabase/migrations/20260815000012_app_role_and_resource_reads.sql`,
    a thin `st_x`/`st_y` projection over `hospitals` — PostgREST cannot
    itself call PostGIS functions) filtered by the same four
    `?bbox=`-derived range filters `risk-map.ts` established
    (`lon`/`lat` between the parsed bbox's min/max), capped at
    `HOSPITAL_RESULT_LIMIT` (200) rows. `bbox` is required here (unlike
    risk-map's optional one) and validated by `parseBbox()`
    (`packages/geo/bbox.ts`) — malformed, inverted, or over-
    `BBOX_MAX_SPAN_DEG` values are a generic `400`. Public, no
    rate-limit (decision J). `Cache-Control` is
    `s-maxage=60, stale-while-revalidate=120`.
  - `GET /api/resources/blood?bloodGroup=&lat=&lng=&radius=` — the one
    deliberate exception to this codebase's "never a live spatial join on
    the request path" rule (§4.2/§6 amendment, restated below). Calls the
    `blood_within_radius(p_blood_group, p_lat, p_lon, p_radius_m)` SQL
    function via `supabase.rpc(...)`, which joins `blood_inventory` to
    `hospitals` and runs `ST_DWithin` against `radiusM` (clamped by
    `bloodSearchQuerySchema`'s `.max(RESOURCE_SEARCH_RADIUS_MAX_M)`,
    50000 m), ordered by `distance_m` ascending, capped at 200 rows
    inside the SQL function itself. Public, no rate-limit. Same cache
    header as `/hospitals`.
  - `PATCH /api/resources/blood/:id` — the highest-authorization-risk
    endpoint in this feature, restated below under Security
    Considerations. `auth()` + `rateLimit` (`BLOOD_UPDATE_RATE_LIMIT`,
    10/min/user) gate the route; the handler then re-reads the target
    row's `hospital_id` and checks `verified_hospital_staff` before any
    write. A missing inventory row is a generic `404`; a caller who is
    verified staff but not *for that hospital* is a generic `403`. Only
    `unitsAvailable`/`plateletUnits` are writable (schema-capped at
    `BLOOD_UNITS_MAX`, 500); `updated_by`/`updated_at` are always
    server-set, never taken from the request body. Returns the updated
    row mapped to `bloodAvailabilityDtoSchema` (the same shape
    `GET /blood` returns), assembled from the update result plus a
    `hospital_locations` lookup — `distanceM` has no meaning for a direct
    PATCH (no search origin exists) and is set to `0`, documented in code
    at the call site.
- `apps/api/src/lib/resourceDto.ts` — `toHospitalDto()` and
  `toBloodAvailabilityDto()` map untyped PostgREST/RPC rows (`unknown`,
  R7) to the frozen `hospitalDtoSchema`/`bloodAvailabilityDtoSchema`
  shapes, mirroring `weatherDto.ts`'s style — every numeric column goes
  through `toNumberOrNull()` since PostgREST can return a `numeric`
  column as a string.
- `apps/web`'s `/resources` page (`apps/web/src/pages/Resources.tsx`) is a
  blood-group filter (`<select>`) over a table of nearby hospitals' stock
  for that group. Initial paint is `fetchApi` against `GET
  /api/resources/blood` (fixed Dhaka-centered search origin for this
  slice — `apps/web/src/hooks/useGeolocation.ts` is still a stub owned by
  a different slice). `apps/web/src/features/resources/` holds:
  - `useBloodAvailability.ts` — the `fetchApi`/`useQuery` wrapper.
  - `useBloodInventoryRealtime.ts` — the live path, restated below.
  Live updates from Realtime are merged into the fetched list client-side
  by `inventoryId`, so a `postgres_changes` row updates the matching
  table row's units/platelets/updated-at in place without refetching.
- **Realtime path (ADR-010) — talks to Supabase directly from the
  browser, never through the Worker.** `useBloodInventoryRealtime` calls
  `supabase.channel('blood_inventory-changes').on('postgres_changes',
  { event: '*', schema: 'public', table: 'blood_inventory' }, handler)`
  using `apps/web/src/lib/supabaseClient.ts`'s existing anon-key client
  (never a second client). `blood_inventory` is enrolled in the
  `supabase_realtime` publication by the frozen migration (`alter
  publication supabase_realtime add table blood_inventory`); the table's
  RLS `select` policy is already public (`blood_inventory_select_public`,
  `20260201000007_rls_policies.sql`), which Realtime's row-level
  broadcast respects. Every field of every `postgres_changes` payload
  goes through optional chaining plus a runtime `typeof` check
  (`toChangePayload()`) before use — the payload is untrusted at the type
  level (R7) even though it originates from our own DB, because the wire
  format is Realtime's JSON envelope, not the DTO schema. The channel is
  torn down with `supabase.removeChannel(channel)` in the `useEffect`
  cleanup — verified by a jsdom unit test
  (`apps/web/src/features/resources/useBloodInventoryRealtime.test.ts`)
  that mocks `supabase.channel`/`removeChannel` and asserts the mock is
  called on unmount. When the channel's `subscribe()` status callback
  reports `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`, the hook returns
  `'unavailable'` and the page shows a plain "live updates unavailable"
  message — the table itself keeps rendering from the last successful
  fetch, never blanking (`apps/web/e2e/resources.spec.ts` exercises this
  by overriding `window.WebSocket` before the page loads, since the
  pinned Playwright version, 1.46, predates `page.routeWebSocket()`).

**Critical Constants:**

| Constant | Value | Defined in | Purpose |
|---|---|---|---|
| `HOSPITAL_RESULT_LIMIT` | 200 | local const, `apps/api/src/routes/resources.ts` (§14 registry) | caps `GET /hospitals`' row count |
| `RESOURCES_CACHE_TTL_S` | `s-maxage=60, stale-while-revalidate=120` | local const, `apps/api/src/routes/resources.ts` (§14 registry) | edge cache for both public GETs |
| `BLOOD_UNITS_MAX` | 500 | `packages/types/api.ts` | ceiling on `unitsAvailable`/`plateletUnits`, both read and write |
| `RESOURCE_SEARCH_RADIUS_DEFAULT_M` | 5000 | `packages/types/api.ts` | default `?radius=` |
| `RESOURCE_SEARCH_RADIUS_MAX_M` | 50000 | `packages/types/api.ts` | ceiling `?radius=` clamps to |
| `BLOOD_UPDATE_RATE_LIMIT` | `{ perMinute: 10 }` | `packages/security` | `PATCH /blood/:id` rate limit |
| `BBOX_MAX_SPAN_DEG` | 10 | `packages/geo/bbox.ts` | rejects an absurd `/hospitals` viewport |
| the RPC's internal row cap | 200 | `blood_within_radius()`, `20260815000012_app_role_and_resource_reads.sql` | bounds the live spatial join regardless of what the client asks for |

**Security Considerations:**

STRIDE analysis, mirrored into `docs/security/threat-model.md`:

- **§4.2/§6 amendment — `GET /api/resources/blood` runs a live
  `ST_DWithin`.** This is a deliberate, documented exception to the
  codebase's normal "never a live spatial join on the request path"
  discipline (the same discipline `region_risk_geojson` follows by
  pre-computing its geometry). It is bounded three ways: the `hospitals`
  table's GiST index on `geom` keeps the `ST_DWithin` filter sargable
  regardless of table size; `RESOURCE_SEARCH_RADIUS_MAX_M` (50000 m)
  caps how large a circle a caller can ask the index to search;
  `blood_within_radius()`'s own `limit 200` caps the join's output
  regardless of how many hospitals fall inside that circle. No caching
  layer sits in front of it because blood-stock freshness is the point
  of this endpoint.
- **Tampering — `PATCH /blood/:id` is the highest-authorization-risk
  endpoint in this feature.** `apps/api`'s Supabase client uses the
  **service-role key** (`createSupabaseAdmin`), which bypasses RLS
  entirely — so `blood_inventory_update_verified_staff`'s RLS policy
  provides *no* protection for a request the Worker makes. The
  handler-level check (read the target row's `hospital_id`, confirm a
  `verified_hospital_staff` row exists for `(user.id, hospital_id)`) is
  therefore not defense-in-depth, it is **the only check standing
  between an authenticated caller and any hospital's inventory row**.
  `apps/api/test/routes/resources.test.ts` covers this directly with a
  staff-at-hospital-X-patching-hospital-Y's-row case that must 403 — a
  regression here is a real authorization bypass, not a test-quality
  issue.
- **Granting `verified_hospital_staff` status is a manual SQL step, not
  a UI flow.** No seed data and no admin screen exist for this table by
  design (§13 scope) — an operator runs, against the project's Supabase
  SQL editor or `psql`:

  ```sql
  insert into verified_hospital_staff (user_id, hospital_id)
  values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
  ```

  substituting the real `auth.users.id` and `hospitals.id` values. The
  table's RLS (`verified_hospital_staff_insert_admin`) additionally
  restricts *interactive* (RLS-respecting) inserts to an `admin`
  `app_role()` — the service-role key used for this manual step bypasses
  that too, which is expected for an ops action, not a client request.
- **Information disclosure:** a PostgREST/RPC error body echoed to the
  client. Mitigated by `buildGenericErrorBody()` on every error branch
  across all three routes (including the PATCH's inventory/staff/update/
  hospital reads), real error detail logged server-side keyed by
  `requestId`.
- **Denial of service:** an unbounded radius or bbox forcing a full
  scan. Mitigated by `RESOURCE_SEARCH_RADIUS_MAX_M`, `BBOX_MAX_SPAN_DEG`,
  the GiST index, and both row caps (`HOSPITAL_RESULT_LIMIT`,
  `blood_within_radius()`'s internal `limit 200`).
- **Spoofing:** the two GETs are unauthenticated public reads with no
  identity to spoof, stated explicitly. The PATCH's identity comes from
  the verified Supabase JWT (`auth()` middleware), never a client-supplied
  field.
- **Realtime information disclosure:** `blood_inventory`'s public select
  RLS policy means the live channel broadcasts every hospital's stock
  level to every subscribed browser tab, authenticated or not — this is
  an intentional design choice (blood availability is meant to be public
  information during a dengue outbreak), not an oversight, and matches
  the same table's public REST read via `GET /blood`.

**Manual Test Log:**

2026-08-16, initial implementation pass. Full workerd Vitest suite
(`apps/api/test/routes/resources.test.ts`, 27 cases) exercises every
branch reachable without a hosted Supabase project, including the
authorization-boundary case above. `apps/api/e2e/resources.spec.ts` and
`apps/web/e2e/resources.spec.ts` are contract/route-interception suites,
matching `weather.spec.ts`'s and `risk-map.spec.ts`'s existing shape —
DB-dependent happy-path rows for the two `apps/api` e2e GET tests are
"not run locally" (no hosted Supabase project reachable from this
worktree) and covered instead by the Vitest route suite. Reviewer
sign-off pending.
