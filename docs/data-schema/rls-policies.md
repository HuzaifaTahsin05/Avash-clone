# Row Level Security Policies

RLS is **on** for every table in this project by default
(`docs/PROJECT_PLAN.md` §4.1). Any table shipped without RLS enabled must
carry its own ADR explaining why — there is no silent exception. This
document states the intended stance for all four operations
(`select`/`insert`/`update`/`delete`) on every table from §4. The policy
SQL itself lives in
`packages/db/supabase/migrations/20260201000007_rls_policies.sql`, as
later amended by `20260815000012_app_role_and_resource_reads.sql` and
`20260816000013_rbac_roles_and_audit.sql` — this document is the
human-readable contract those migrations were written against, kept in
sync by hand.

**RLS is only the second check — GRANT is the first.**
Postgres evaluates object-level privileges *before* any policy, so a table
the browser reads directly needs an explicit `grant select` to `anon` or
`authenticated`. Without it PostgREST answers 42501 "permission denied for
table" and the policies below never run at all. This project's default
privileges auto-grant only TRUNCATE/REFERENCES/TRIGGER, never
SELECT/INSERT/UPDATE/DELETE — `20260215000010_service_role_grants.sql`
found that and fixed it for `service_role` alone, which is how `apps/api`
and the jobs connect. The two tables the browser reads *itself* were left
without grants, so the moderation queue and the Realtime ticker failed the
privilege check with their policies never consulted; no amount of getting
the stances below right could have made them work.
`20260816000014_client_read_grants.sql` grants exactly `breeding_reports`
(authenticated), `blood_inventory` (anon + authenticated), and
`role_assignments` (authenticated) — and nothing else. Every other table
stays service-role-only, so a newly added table is private by default
rather than one forgotten policy away from public.

**Read `public.has_capability('<capability>')` wherever a stance below
says `role() = ...`.** Two rewrites got us here. `auth.role()` returns the
PostgREST role (`anon`/`authenticated`) and can never equal `moderator`
or `admin`, so every policy originally written that way was dead —
migration `...000012` replaced them with `public.app_role()`. Migration
`...000013` then moved them again, from role-name lists to
`public.has_capability()`, the SQL mirror of `ROLE_CAPABILITIES` in
`packages/security/roles.ts`, so that adding a role is one grant-table
edit per language instead of an audit of every policy. The capability
each stance maps to is named inline below.

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
| update | `has_capability('reports:moderate')` | citizens cannot self-verify or edit their own submission after creation |
| delete | nobody | no delete path; a rejected/resolved report stays in `status` history |

A second `select` policy, `breeding_reports_select_moderation`
(`has_capability('reports:moderate')`), exposes **pending** rows to the
moderation queue — the stance above hides them from everyone but the
reporter, which would leave the queue permanently empty. RLS policies are
OR-ed, so the two coexist.

## `hospitals`

| Operation | Who | Predicate |
|---|---|---|
| select | public (`anon`) | none — required for public resource lookup |
| insert | `has_capability('hospitals:manage')` | new hospital listings are admin-curated |
| update | `has_capability('hospitals:manage')` | prevents unverified edits to hospital identity/location |
| delete | `has_capability('hospitals:manage')` | rare, admin-only |

## `blood_inventory`

| Operation | Who | Predicate |
|---|---|---|
| select | public (`anon`) | required for the direct Supabase Realtime subscription (ADR-010) |
| insert | `inventory:write` **and** `verified_hospital_staff` for that hospital | `has_capability('inventory:write') and auth.uid() in (select user_id from verified_hospital_staff where hospital_id = blood_inventory.hospital_id)` |
| update | same predicate as insert | double-checked again in the `apps/api` route handler (defense in depth, §7.2) |
| delete | nobody via client | row lifecycle is create-then-update; no delete path |

## `verified_hospital_staff`

| Operation | Who | Predicate |
|---|---|---|
| select | `has_capability('roles:manage')`, or the row's own `user_id = auth.uid()` | staff can see their own verification rows; broad visibility is admin-only |
| insert | `has_capability('roles:manage')` | staff verification is an admin-granted trust relationship |
| update | not applicable | table has no mutable columns beyond the composite key |
| delete | `has_capability('roles:manage')` | admin revokes staff access |

The membership row and the `hospital_staff` role claim are **two
independent grants**, both required to write inventory. Revoking the role
locks someone out immediately without having to find and delete their
membership rows; revoking membership scopes them out of one hospital
without touching their role. An admin holds `inventory:write` and is
still refused without a membership row — administering the system is not
the same as being authorized to state a hospital's blood stock.

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
| select | `reviewed = true` rows public; unreviewed rows `has_capability('news:moderate')` only | unreviewed AI output must never be publicly visible before human review (§5.4) |
| insert | none via client | service-role key only (`cron-news-scan.yml`) |
| update | `has_capability('news:moderate')` | sets `reviewed`/`flagged` during the review workflow |
| delete | `has_capability('hospitals:manage')` | rare, for retracting a bad ingest; admin-only, same capability as the other destructive admin operations |

## `role_assignments`

Append-only audit trail for role grants
(`20260816000013_rbac_roles_and_audit.sql`, `docs/features/rbac.md`). It
records history and **never gates a request** — `app_metadata.role` on the
auth user stays the sole authorization source.

| Operation | Who | Predicate |
|---|---|---|
| select | `has_capability('roles:manage')` | admin-only; the subject of a grant cannot read their own history, since the list also names the granting admin |
| insert | none via client | service-role key only (`apps/api`'s role route and `scripts/grant-role.ts`) |
| update | nobody | **deliberately no policy.** An audit row that can be edited is not an audit row; corrections are appended |
| delete | nobody | as above |

---

Any exception to "RLS on by default" — for example, a future read-only
public reporting table with no sensitive predicate at all — still requires
RLS to be enabled with an explicit `using (true)` policy rather than RLS
disabled outright, so the table's access intent stays legible in the
policy list rather than as an implicit absence.
