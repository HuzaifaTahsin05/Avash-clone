-- docs/PROJECT_PLAN.md §4 — read-optimized map surface. Refreshed by the
-- batch-predict job (MV_REFRESH_INTERVAL, §14), never on the request path.
create materialized view region_risk_summary as
  select distinct on (r.id, p.horizon_weeks)
         r.id as region_id, r.name, r.geom,
         p.risk_score, p.risk_level, p.horizon_weeks, p.generated_at
  from regions r
  join risk_predictions p on p.region_id = r.id
  order by r.id, p.horizon_weeks, p.prediction_date desc;

-- Required for `refresh materialized view concurrently` (§4) — a
-- concurrent refresh raises an error at runtime without a unique index.
create unique index uq_summary_region_horizon on region_risk_summary (region_id, horizon_weeks);
create index idx_summary_geom on region_risk_summary using gist (geom);
-- refreshed via: refresh materialized view concurrently region_risk_summary;
