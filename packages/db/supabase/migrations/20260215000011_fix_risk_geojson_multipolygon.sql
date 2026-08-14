-- Fixes region_risk_geojson (20260215000009_api_read_views.sql): for a
-- region whose MultiPolygon has exactly one part — every seeded region
-- today — st_simplifypreservetopology silently drops the Multi wrapper
-- and returns a plain Polygon. regions.geom is declared
-- geometry(MultiPolygon, 4326) (20260201000001), and
-- packages/types' riskMapResponseSchema requires geometry.type to be
-- exactly "MultiPolygon", so that Polygon fails response validation and
-- GET /api/risk-map 503s. st_multi() forces the result back to
-- MultiPolygon regardless of part count; it is a no-op for anything that
-- already simplifies to more than one part.
create or replace view region_risk_geojson
  with (security_invoker = true) as
  select s.region_id,
         s.name as region_name,
         s.risk_score,
         s.risk_level,
         s.horizon_weeks,
         s.generated_at,
         st_asgeojson(st_multi(st_simplifypreservetopology(s.geom, 0.001)))::jsonb as geometry,
         st_xmin(s.geom) as min_lon,
         st_ymin(s.geom) as min_lat,
         st_xmax(s.geom) as max_lon,
         st_ymax(s.geom) as max_lat
  from region_risk_summary s;
