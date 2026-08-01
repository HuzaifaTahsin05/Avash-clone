# ADR-006: Materialized view `region_risk_summary` for map reads

**Date:** 2026-08-01
**Status:** Accepted

## Context

The risk map is the highest-traffic read path in the product — every page
load, pan, and zoom potentially triggers a query joining `regions` against
the latest `risk_predictions` row per `(region_id, horizon_weeks)`. Doing
that join live, on every request, against the raw `risk_predictions` table
(which accumulates a new row set on every 24h batch run) is wasted
repeated work: the underlying data only changes once per batch-predict run,
not once per map interaction.

**Rejected alternative:** query `regions` joined to `risk_predictions`
live on every `/api/risk-map` request, using a `DISTINCT ON` to get the
latest row per region/horizon. Rejected because it re-executes the same
expensive join and sort on every single request instead of once per batch
run, adding unnecessary load and latency to the hottest read path in the
system.

## Decision

`region_risk_summary` is a materialized view (`docs/PROJECT_PLAN.md` §4)
built with `distinct on (r.id, p.horizon_weeks)` over `regions` joined to
`risk_predictions`, ordered by most recent `prediction_date`. It is
refreshed via `refresh materialized view concurrently region_risk_summary`
immediately after each batch-predict run (`scripts/refresh-materialized-views.ts`,
invoked from `ml/serving/predict.py`'s post-inference step). A **unique**
index `uq_summary_region_horizon` is required for the `concurrently`
refresh to work at all, plus a GiST index on `geom` for bbox-clipped map
reads.

## Consequences

**Easier:** every map/dashboard read is a fast, indexed query against a
precomputed, already-joined table — no live spatial join on the request
path, matching the performance targets in §8.

**Harder:** the map is only as fresh as the last successful refresh — if
`refresh-materialized-views.ts` fails silently, the map serves stale data
without an inherent staleness signal beyond `generated_at`. The unique
index is a hard prerequisite: without it, `refresh ... concurrently` fails
at runtime, so schema migrations must create it in the same migration as
the view.
