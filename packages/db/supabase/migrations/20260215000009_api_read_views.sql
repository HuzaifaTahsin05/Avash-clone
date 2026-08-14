-- Read-only projections for apps/api. PostgREST (which is what
-- @supabase/supabase-js talks to) cannot call ST_AsGeoJSON, ST_Centroid,
-- or DISTINCT ON, and cannot express a bbox intersection. Each view below
-- pushes exactly one of those into SQL and exposes plain scalars the REST
-- layer can filter on. No table, column, or index is added or altered:
-- docs/PROJECT_PLAN.md §4 remains the schema of record.
--
-- security_invoker = true on all four: without it a view runs with the
-- definer's rights and silently bypasses the RLS policies in
-- 20260201000007_rls_policies.sql. The service-role key apps/api uses
-- bypasses RLS anyway — this is defense in depth for any future anon read.

-- Weather rows with their region's code and name attached, so apps/api
-- never needs an embedded resource or a second round trip.
create or replace view region_weather_observations
  with (security_invoker = true) as
  select w.id, w.region_id, r.code as region_code, r.name as region_name,
         w.observed_at, w.temp_mean_c, w.temp_min_c, w.temp_max_c,
         w.humidity_pct, w.precipitation_mm, w.source
  from weather_observations w
  join regions r on r.id = w.region_id;

-- "Latest per region" (§4.2), served by idx_weather_region_time.
create or replace view region_latest_weather
  with (security_invoker = true) as
  select distinct on (region_id) *
  from region_weather_observations
  order by region_id, observed_at desc;

-- Ingest targets: one point per region for the weather job. Emitted as
-- plain numerics, not geometry, so the job never has to decode WKB.
create or replace view region_ingest_targets
  with (security_invoker = true) as
  select r.id as region_id, r.code, r.name,
         st_y(st_centroid(r.geom))::numeric(9,6) as lat,
         st_x(st_centroid(r.geom))::numeric(9,6) as lon
  from regions r;

-- The map read surface (ADR-006): GeoJSON geometry plus a plain-numeric
-- envelope. The envelope columns are what makes `?bbox=` expressible over
-- REST — two envelopes intersect iff a.min <= b.max on both axes, which
-- is four ordinary range filters. Simplification tolerance is
-- MAP_GEOMETRY_SIMPLIFY_TOLERANCE_DEG (§14).
create or replace view region_risk_geojson
  with (security_invoker = true) as
  select s.region_id,
         s.name as region_name,
         s.risk_score,
         s.risk_level,
         s.horizon_weeks,
         s.generated_at,
         st_asgeojson(st_simplifypreservetopology(s.geom, 0.001))::jsonb as geometry,
         st_xmin(s.geom) as min_lon,
         st_ymin(s.geom) as min_lat,
         st_xmax(s.geom) as max_lon,
         st_ymax(s.geom) as max_lat
  from region_risk_summary s;

-- No grants. apps/api reads these with the service-role key; nothing is
-- exposed to anon or authenticated until a slice actually needs it, which
-- keeps the default deny.
