---
name: postgis
description: Use when writing spatial SQL, PostGIS query builders in packages/geo, or any migration touching a geometry column. Invoke for ST_DWithin/ST_Contains queries, GiST indexing, bbox clipping, or materialized-view refresh logic.
---

# PostGIS Query Discipline for Avash

See ADR-003 for why PostGIS was chosen over generic lat/lng columns, and
`docs/data-schema/schema.md` §4.2 for the full indexing rules this skill
summarizes.

## Core query patterns

- **Proximity:** `ST_DWithin(geom, point, radius_m)` — always pass radius
  in meters against a geography cast or an appropriately projected
  geometry; never approximate distance with raw lat/lng arithmetic.
- **Bbox clipping:** clip map reads to the requested viewport bbox before
  any other filtering, to keep the row set small before further
  processing. Clamp the max bbox area server-side (threat-model DoS
  mitigation, `docs/security/threat-model.md`).
- **Containment:** use `ST_Contains`/`ST_Within` for "which region is this
  point in" — never a manual polygon-math approximation.

## Mandatory GiST indexes

Every geometry column gets a GiST index — non-negotiable, no exceptions.
When writing a migration that adds a `geometry(...)` column, the `create
index ... using gist (...)` statement is part of the same migration, not a
follow-up. `packages/geo` query builders assume every geometry column
they touch is indexed; a missing index is a schema bug, not a query bug.

## MV refresh strategy

`region_risk_summary` (ADR-006) is refreshed via `refresh materialized
view concurrently`, which **requires** a unique index on the view
(`uq_summary_region_horizon`) — without it, `concurrently` fails at
runtime. Never refresh without `concurrently` in a path that runs while
the map is potentially being read — a non-concurrent refresh takes an
exclusive lock and blocks reads for its duration.

## §4.2 query rules

- Every "latest record per entity" query uses a composite index
  `(entity_id, timestamp desc)` — write the query to match the index
  order (`order by entity_id, timestamp desc`), not the other way around.
- Every hot UI read path is served from a materialized view or covering
  index — never a live `ST_DWithin` join against raw tables on the
  request path. If a new read pattern doesn't fit an existing MV/index,
  that's a signal to add one, not to accept a live spatial join in
  production.

## `statement_timeout`

`DB_STATEMENT_TIMEOUT_S` = 5s is enforced at the Supabase API role level
(not per-session) to prevent a runaway spatial query from starving the
connection pool. Don't write a query that assumes it can run longer than
this — if a legitimate query needs more time, that's a signal to add an
index or precompute it into a materialized view instead of raising the
timeout.

## `packages/geo`'s boundary

`packages/geo` builds and returns query fragments — it never imports a
Supabase client directly and never executes a query itself (SOLID
boundary, `docs/PROJECT_PLAN.md` §9). Callers in `apps/api` compose the
fragment into an actual query execution.
