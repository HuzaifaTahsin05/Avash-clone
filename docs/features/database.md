# Database Schema & Models

Follows the mandatory template from `docs/PROJECT_PLAN.md` §12.

**Gist:** `packages/db` ships the full §4 PostGIS schema — 11 tables, 1
enum, 1 materialized view — as versioned, idempotently-runnable
migrations, with RLS enabled and policy-scoped on every table, generated
row types re-exported through `packages/types`, a readiness probe wired
into `apps/api`, and idempotent seed/refresh tooling. Verified against the
local Postgres 15 + PostGIS container (`pnpm docker:db`) since no hosted
Supabase project exists yet.

**Technical Detail:**
- **Migrations:** `packages/db/supabase/migrations/*.sql`, 8 files,
  timestamp-prefixed, applied in filename order by
  `packages/db/scripts/migrate.mjs` — a small `pg`-based runner (not the
  full `supabase` CLI stack, which assumes a linked hosted project) that
  tracks what has run in a `_migrations` table, so re-running is a no-op.
  `pnpm db:migrate` / `pnpm db:reset` / `pnpm db:seed` / `pnpm db:types`
  at the repo root delegate to `packages/db`'s own scripts of the same
  name.
- **Local auth shim:** a plain `postgis/postgis` container has no
  `auth.users` table or `auth.uid()`/`auth.role()` functions — every real
  Supabase project has both, managed by GoTrue. `docker/postgis/initdb/01-auth-shim.sql`
  adds a minimal stand-in (same function signatures, reading the same
  `request.jwt.claim.*` session settings PostgREST sets) so migrations and
  RLS policies that reference `auth.users`/`auth.uid()`/`auth.role()`
  apply here unchanged. It is never applied against a real Supabase
  project, which manages this schema itself — kept out of
  `packages/db/supabase/migrations/` for exactly that reason. `auth.uid()`-driven
  behavior end-to-end (an actual authenticated session) still needs the
  Supabase CLI's local stack; this shim only unblocks *migration
  application* and RLS *policy-shape* testing.
- **Row shapes:** hand-maintained in `packages/db/types.ts` (no hosted
  project to run `supabase gen types typescript` against yet —
  `packages/db/scripts/generate-types.mjs` explains the switchover), kept
  column-for-column in sync with the migrations by hand. `packages/types/domain.ts`
  and `packages/types/ml.ts` re-export the subset both apps consume (R3) —
  `Region`, `RiskPrediction`, and friends are defined exactly once, in
  `packages/db/types.ts`, never inline in either app.
- **`GET /health/db`** (`apps/api/src/routes/health.ts`): a bounded
  `select id from regions limit 1` through
  `apps/api/src/lib/supabaseAdmin.ts`. See `docs/features/health-endpoint.md`
  for the full readiness-probe writeup.
- **Seed data** (`scripts/seed-db.ts`): 3 regions (Dhaka, Chattogram,
  Sylhet) with real bounding-box `MultiPolygon` geometry, 4 hospitals with
  4 blood groups of inventory each, 7 days of weather observations and 4
  weeks of case history per region. Idempotent two ways: `regions`,
  `dengue_cases`, and `blood_inventory` rely on real unique constraints
  with `on conflict do nothing`; `hospitals` and `weather_observations`
  (no natural unique key in the schema) check for an existing row by the
  seed's own identifying columns before inserting. Verified by running it
  twice — second run inserts zero new rows in every table.
- **MV refresh** (`scripts/refresh-materialized-views.ts`): `refresh
  materialized view concurrently region_risk_summary`, invoked by
  `ml/serving/predict.py` after every batch-predict run
  (`MV_REFRESH_INTERVAL`, §14). `concurrently` requires the unique index
  `uq_summary_region_horizon` — verified directly by running the refresh
  against a live view.
- **Statement timeout:** `alter role postgres set statement_timeout =
  '5s'` (`DB_STATEMENT_TIMEOUT_S`, §14), applied at the role level so a
  client cannot opt out by simply never setting a session-level timeout.

**Critical Constants:**

| Constant | Value | Defined in | Status |
|---|---|---|---|
| `RISK_LEVEL_BANDS` | low < .25, moderate < .50, high < .75, severe ≥ .75 | `packages/types/ml.ts`, `risk_predictions.risk_level` generated column | implemented |
| `ALERT_PROXIMITY_RADIUS_DEFAULT_M` | 2000 (bounds: 100–20,000) | `packages/geo`, `alert_subscriptions` check constraint | implemented |
| `DB_STATEMENT_TIMEOUT_S` | 5 | `alter role postgres set statement_timeout` migration | implemented |
| `MV_REFRESH_INTERVAL` | triggered post-batch-predict | `scripts/refresh-materialized-views.ts` | implemented |

**Security Considerations:**
- **RLS on every table (§4.1):** all 11 product tables have
  `row level security` enabled; none rely on an ADR exception. Verified by
  querying `pg_class.relrowsecurity` (`packages/db/test/schema.spec.ts`).
  Every policy's predicate was reconciled against
  `docs/data-schema/rls-policies.md` — the human-readable contract the
  migration is written against — table by table, not assumed from the SQL
  alone; `hospitals` and `blood_inventory`'s write policies and
  `verified_hospital_staff`/`news_items`'s full stance were tightened from
  an initial pass to match that doc exactly.
- **R2 (secrets never reach the client):** `SUPABASE_SERVICE_ROLE_KEY`
  and `SUPABASE_URL` are read only in `apps/api/src/lib/supabaseAdmin.ts`,
  server-side; grep proof it appears nowhere under `apps/web/src`.
- **R4 (optional chaining / graceful failure):** `/health/db`'s Supabase
  call is wrapped in `try`/`catch`; any failure — missing env var, network
  error, auth error — collapses to the same generic `{ ready: false,
  reason: "database unreachable" }` shape, never a raw driver error.
- **Local-only guardrail:** `packages/db/scripts/reset.mjs` refuses to run
  against any `DATABASE_URL_LOCAL` that isn't `127.0.0.1`/`localhost` with
  database name `avash` — a mistyped connection string cannot drop a real
  project's schema.
- **Generated `risk_level` column:** boundary values (0.24/0.25/0.49/0.50/0.74/0.75)
  tested directly against the live database, not inferred from the SQL —
  a rounding or comparison-operator mistake in the `case when` expression
  would show up as a wrong band, not a crash.

**Manual Test Log:** run against `pnpm docker:db` (local PostGIS
container). `pnpm db:migrate` applied all 8 migrations cleanly, and a
second run reported "up to date — nothing new to apply" (no
double-application). `pnpm db:seed` run twice inserted zero duplicate
rows the second time (idempotency confirmed by row-count comparison, not
assumed). `packages/db/test/schema.spec.ts` — 19 cases (4 GiST index
checks, RLS enabled on all 11 product tables, all 8 `risk_level` boundary
bands, 4 check-constraint rejections, the MV's unique index and a real
`refresh materialized view concurrently`) — passed in full against the
live container. The suite's `requireDb()` skip path (silent-pass
prevention) was verified separately by pointing it at an unreachable host
and confirming every case reports `skipped`, not `passed`. Last pass test
date: 2026-08-14.
