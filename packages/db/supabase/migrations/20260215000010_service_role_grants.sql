-- apps/api and scripts/jobs/* read and write every table here using the
-- service-role key. `service_role` has BYPASSRLS, which skips row-level
-- security policies, but that is orthogonal to object-level ACL grants —
-- Postgres still checks GRANT/REVOKE independently of RLS. None of the
-- prior migrations granted service_role anything, and this project's
-- default-privilege setup only auto-grants it TRUNCATE/REFERENCES/TRIGGER
-- on new objects (verified against the hosted project), not
-- SELECT/INSERT/UPDATE/DELETE — every table and the four read views in
-- 20260215000009_api_read_views.sql were unreadable by service_role until
-- this migration.
-- `service_role` only exists on a Supabase-bootstrapped Postgres (see the
-- same caveat in 20260215000009_api_read_views.sql) — the vanilla
-- postgis/postgis image compose.yaml runs locally has no such role, so
-- this is wrapped to no-op there instead of failing db:reset.
do $$
begin
  grant select, insert, update, delete on all tables in schema public to service_role;
  grant usage, select on all sequences in schema public to service_role;

  -- Cover tables/views created by later migrations too, not just what
  -- exists today.
  alter default privileges in schema public
    grant select, insert, update, delete on tables to service_role;
  alter default privileges in schema public
    grant usage, select on sequences to service_role;
exception
  when undefined_object then
    raise notice 'service_role not present (local Postgres without Supabase auth bootstrap) — skipping grants.';
end $$;
