# ADR-003: PostGIS over generic lat/lng columns

**Date:** 2026-08-01
**Status:** Accepted

## Context

Avash's core reads are inherently spatial: "risk near me," "nearest
hospital with O- blood," "reports within this region's polygon,"
"subscribers within N meters of an event." A naive schema using separate
`lat`/`lng` numeric columns pushes all distance/containment math into
application code or ad-hoc SQL using the Haversine formula, with no
index-accelerated way to do proximity or polygon-containment queries.

**Rejected alternative:** plain `numeric` `lat`/`lng` columns with
application-level bounding-box filtering. Rejected because it cannot use a
spatial index (a B-tree on `lat` and a separate one on `lng` cannot satisfy
a single 2D range/proximity query efficiently), forcing either full-table
scans or a hand-rolled geohash scheme that PostGIS already solves properly.

## Decision

Use PostGIS `geometry` columns (`Point` for hospitals/alerts/reports,
`MultiPolygon` for `regions`), all in SRID 4326 (WGS84 lat/lng), with
native `ST_DWithin` for proximity queries and `ST_Contains`/polygon lookups
for region membership. Every geometry column carries a mandatory GiST
index (`docs/PROJECT_PLAN.md` §4.2).

## Consequences

**Easier:** proximity ("hospitals within 5km"), containment ("which region
is this point in"), and bbox-clipped map reads all become single indexed
SQL queries instead of application-level math. `region_risk_summary`
(ADR-006) and every `ST_DWithin` in `packages/geo` depend on this.

**Harder:** requires the `postgis` extension enabled on the Supabase
project, geometry-aware type generation for `packages/types` (M6-T10), and
contributors need at least a basic working knowledge of PostGIS query
syntax (`docs/standards/backend.md` and `docs/data-schema/schema.md`
document the query discipline expected).
