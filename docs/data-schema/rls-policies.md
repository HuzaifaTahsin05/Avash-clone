# Row Level Security Policies

RLS is **on** for every table in this project by default
(`docs/PROJECT_PLAN.md` §4.1). Any table shipped without RLS enabled must
carry its own ADR explaining why — there is no silent exception. This
document states the intended stance for all four operations
(`select`/`insert`/`update`/`delete`) on every table from §4. Policy SQL
itself is written in `packages/db/supabase/migrations/` (Milestone 6);
this document is the human-readable contract that migration is written
against.

## `regions`

| Operation | Who | Predicate |
|---|---|---|
| select | public (`anon`, `authenticated`) | none — reference data, always public |
| insert | none via client | admin-only, via service-role key (seed/migration only) |
| update | none via client | admin-only, via service-role key |
| delete | none via client | admin-only, via service-role key |

## `weather_observations`

| Operation | Who | Predicate |
|---|---|---|
| select | public | none — feeds public weather dashboard |
| insert | none via client | service-role key only (`cron-weather-ingest.yml`) |
| update | nobody | append-only; corrections are new rows, not mutations |
| delete | nobody | append-only |

## `dengue_cases`

| Operation | Who | Predicate |
|---|---|---|
| select | public | none — historical data feeds the map/trend UI |
| insert | none via client | service-role key only (seed / ingestion script) |
| update | none via client | service-role key only, corrections handled deliberately |
| delete | nobody | historical record retained |

## `risk_predictions`

| Operation | Who | Predicate |
|---|---|---|
| select | public (`anon`) | none — powers the map |
| insert | none via client | service-role key only (`cron-batch-predict.yml`) |
| update | nobody | predictions are immutable once generated; a new batch run writes new rows |
| delete | nobody | historical predictions retained for audit/backtesting |

## `region_risk_summary` (materialized view)

Materialized views inherit no independent RLS of their own in Postgres;
access is controlled by granting `select` on the view to `anon`/
`authenticated` roles only. No `insert`/`update`/`delete` path exists —
it is refreshed wholesale via `refresh materialized view concurrently`.

| Operation | Who | Predicate |
|---|---|---|
| select | public | none — the map's primary read surface |
| insert/update/delete | nobody | not a table; refreshed via `scripts/refresh-materialized-views.ts` |

## `breeding_reports`

| Operation | Who | Predicate |
|---|---|---|
| select | public | `status = 'verified'` OR `reporter_id = auth.uid()` — a reporter can see their own pending/rejected reports; everyone else only sees verified ones |
| insert | any role incl. `anon` | no predicate — abuse handled by Turnstile + rate limit in `apps/api`, not RLS (ADR-005) |
| update | `role() in ('moderator','admin')` | citizens cannot self-verify or edit their own submission after creation |
| delete | nobody | no delete path; a rejected/resolved report stays in `status` history |

## `hospitals`

| Operation | Who | Predicate |
|---|---|---|
| select | public (`anon`) | none — required for public resource lookup |
| insert | `role() = 'admin'` | new hospital listings are admin-curated |
| update | `role() = 'admin'` | prevents unverified edits to hospital identity/location |
| delete | `role() = 'admin'` | rare, admin-only |

## `blood_inventory`

| Operation | Who | Predicate |
|---|---|---|
| select | public (`anon`) | required for the direct Supabase Realtime subscription (ADR-010) |
| insert | `verified_hospital_staff` for that hospital | `auth.uid() in (select user_id from verified_hospital_staff where hospital_id = blood_inventory.hospital_id)` |
| update | same predicate as insert | double-checked again in the `apps/api` route handler (defense in depth, §7.2) |
| delete | nobody via client | row lifecycle is create-then-update; no delete path |

## `verified_hospital_staff`

| Operation | Who | Predicate |
|---|---|---|
| select | `role() = 'admin'`, or the row's own `user_id = auth.uid()` | staff can see their own verification rows; broad visibility is admin-only |
| insert | `role() = 'admin'` | staff verification is an admin-granted trust relationship |
| update | not applicable | table has no mutable columns beyond the composite key |
| delete | `role() = 'admin'` | admin revokes staff access |

## `alert_subscriptions`

| Operation | Who | Predicate |
|---|---|---|
| select | owner only | `user_id = auth.uid()` |
| insert | authenticated | `user_id = auth.uid()` — a user can only create subscriptions for themself |
| update | owner only | `user_id = auth.uid()` |
| delete | owner only | `user_id = auth.uid()` |

## `push_subscriptions`

| Operation | Who | Predicate |
|---|---|---|
| select | owner only | `user_id = auth.uid()` |
| insert | authenticated | `user_id = auth.uid()` |
| update | owner only | `user_id = auth.uid()` |
| delete | owner only | `user_id = auth.uid()` |

## `news_items`

| Operation | Who | Predicate |
|---|---|---|
| select | `reviewed = true` rows public; unreviewed rows `role() in ('moderator','admin')` only | unreviewed AI output must never be publicly visible before human review (§5.4) |
| insert | none via client | service-role key only (`cron-news-scan.yml`) |
| update | `role() in ('moderator','admin')` | sets `reviewed`/`flagged` during the review workflow |
| delete | `role() = 'admin'` | rare, for retracting a bad ingest |

---

Any exception to "RLS on by default" — for example, a future read-only
public reporting table with no sensitive predicate at all — still requires
RLS to be enabled with an explicit `using (true)` policy rather than RLS
disabled outright, so the table's access intent stays legible in the
policy list rather than as an implicit absence.
