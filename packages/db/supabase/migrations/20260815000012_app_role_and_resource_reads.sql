-- docs/PROJECT_PLAN.md §4.1 amendment — auth.role() returns the PostgREST
-- role (anon/authenticated), never a custom claim, so every policy below
-- that gated on auth.role() in ('moderator','admin') could never evaluate
-- true. public.app_role() reads the actual custom role Supabase signs into
-- app_metadata.role (server-controlled — a user cannot self-assign it,
-- unlike user_metadata). See the §4.1 amendment note for the full record.

create or replace function public.app_role() returns text
  language sql stable security invoker
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

-- Replace the six dead auth.role()-gated policies (plus the two
-- auth.role()-gated news_items policies, same defect) with app_role()
-- equivalents. drop-then-create, never edit migration 07 in place.

drop policy if exists breeding_reports_update_moderation on breeding_reports;
create policy breeding_reports_update_moderation on breeding_reports for update
  using (public.app_role() in ('moderator', 'admin'));

-- Decision F: the moderation queue reads pending reports directly from
-- Supabase; the existing select policy only exposes verified rows or the
-- reporter's own row, which hides pending rows from moderators.
drop policy if exists breeding_reports_select_moderation on breeding_reports;
create policy breeding_reports_select_moderation on breeding_reports for select
  using (public.app_role() in ('moderator', 'admin'));

drop policy if exists hospitals_insert_admin on hospitals;
create policy hospitals_insert_admin on hospitals for insert
  with check (public.app_role() = 'admin');

drop policy if exists hospitals_update_admin on hospitals;
create policy hospitals_update_admin on hospitals for update
  using (public.app_role() = 'admin');

drop policy if exists hospitals_delete_admin on hospitals;
create policy hospitals_delete_admin on hospitals for delete
  using (public.app_role() = 'admin');

drop policy if exists verified_hospital_staff_select on verified_hospital_staff;
create policy verified_hospital_staff_select on verified_hospital_staff for select
  using (public.app_role() = 'admin' or user_id = auth.uid());

drop policy if exists verified_hospital_staff_insert_admin on verified_hospital_staff;
create policy verified_hospital_staff_insert_admin on verified_hospital_staff for insert
  with check (public.app_role() = 'admin');

drop policy if exists verified_hospital_staff_delete_admin on verified_hospital_staff;
create policy verified_hospital_staff_delete_admin on verified_hospital_staff for delete
  using (public.app_role() = 'admin');

drop policy if exists news_items_select_reviewed_public on news_items;
create policy news_items_select_reviewed_public on news_items for select
  using (reviewed = true or public.app_role() in ('moderator', 'admin'));

drop policy if exists news_items_update_moderation on news_items;
create policy news_items_update_moderation on news_items for update
  using (public.app_role() in ('moderator', 'admin'));

drop policy if exists news_items_delete_admin on news_items;
create policy news_items_delete_admin on news_items for delete
  using (public.app_role() = 'admin');

-- Resource read surfaces (§13 slice 6). PostgREST cannot express ST_X/ST_Y
-- or ST_DWithin, so the geometry-to-scalar and radius-search work push
-- into SQL, mirroring 20260215000009_api_read_views.sql's technique.

create or replace view hospital_locations
  with (security_invoker = true) as
  select id, name, address, phone, verified, updated_at,
         st_x(geom) as lon,
         st_y(geom) as lat
  from hospitals;

-- apps/api reads this with the service-role key; the browser's live path
-- is Realtime on blood_inventory directly (ADR-010), never this view.
do $$
begin
  revoke all on hospital_locations from anon, authenticated;
exception
  when undefined_object then
    raise notice 'anon/authenticated role not present (local Postgres without Supabase auth bootstrap) — skipping revoke.';
end $$;

-- Decision E: §6 explicitly specifies a live ST_DWithin nearest-hospital +
-- stock query for GET /api/resources/blood, against §4.2's general "never
-- a live ST_DWithin on the request path" discipline. Bounded by the
-- hospitals GiST index, RESOURCE_SEARCH_RADIUS_MAX_M, and
-- HOSPITAL_RESULT_LIMIT (§14) — the caller clamps radius before this runs.
create or replace function public.blood_within_radius(
  p_blood_group blood_group,
  p_lat double precision,
  p_lon double precision,
  p_radius_m integer
) returns table (
  inventory_id bigint,
  hospital_id uuid,
  hospital_name text,
  hospital_address text,
  hospital_phone text,
  hospital_verified boolean,
  hospital_lat double precision,
  hospital_lon double precision,
  blood_group blood_group,
  units_available integer,
  platelet_units integer,
  updated_at timestamptz,
  distance_m double precision
)
  language sql stable security invoker
as $$
  select
    bi.id as inventory_id,
    h.id as hospital_id,
    h.name as hospital_name,
    h.address as hospital_address,
    h.phone as hospital_phone,
    h.verified as hospital_verified,
    st_y(h.geom) as hospital_lat,
    st_x(h.geom) as hospital_lon,
    bi.blood_group,
    bi.units_available,
    bi.platelet_units,
    bi.updated_at,
    st_distance(
      h.geom::geography,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
    ) as distance_m
  from blood_inventory bi
  join hospitals h on h.id = bi.hospital_id
  where bi.blood_group = p_blood_group
    and st_dwithin(
      h.geom::geography,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
      p_radius_m
    )
  order by distance_m
  limit 200;
$$;

-- blood_inventory needs to stream postgres_changes to the browser
-- directly (ADR-010); RLS already grants public select, but Realtime
-- only ships changes for tables added to the supabase_realtime
-- publication. The local postgis/postgis container has no such
-- publication at all, so this is guarded the same way the grants in
-- 20260215000010_service_role_grants.sql are.
do $$
begin
  alter publication supabase_realtime add table blood_inventory;
exception
  when undefined_object then
    raise notice 'supabase_realtime publication not present (local Postgres without Supabase realtime bootstrap) — skipping.';
  when duplicate_object then
    raise notice 'blood_inventory already in supabase_realtime publication — skipping.';
end $$;
