-- Role-based access control: the full role set, a capability function that
-- mirrors packages/security/roles.ts, and an append-only audit trail for
-- every grant.
--
-- Before this migration the only roles that existed anywhere were
-- 'moderator' and 'admin', there was no way to *assign* one outside the
-- Supabase dashboard, and an ordinary signed-in user had no role at all —
-- so "citizen" was an absence rather than a value, and revoking a role
-- left no record that it had ever been held.

-- ── app_role(): now defaults an authenticated caller to 'citizen' ────────
--
-- Unauthenticated stays NULL, deliberately. Returning 'citizen' for anon
-- would hand every anonymous request citizen's capability set, which is
-- small but not empty — the same distinction readAppRole()/resolveAppRole()
-- keep apart in TypeScript.
create or replace function public.app_role() returns text
  language sql stable security invoker
as $$
  select case
    when auth.uid() is null then null
    else coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), 'citizen')
  end;
$$;

-- ── has_capability(): the SQL mirror of ROLE_CAPABILITIES ────────────────
--
-- Kept in lockstep with packages/security/roles.ts by hand. Policies call
-- this instead of listing role names inline so that adding a role means
-- editing one grant table in each language, not auditing every policy —
-- which is exactly the failure mode that left the original auth.role()
-- policies silently dead (§4.1 amendment).
--
-- Deliberately NOT a rank comparison: hospital_staff and moderator are
-- disjoint, and admin is a superset only because it is explicitly granted
-- every capability.
create or replace function public.has_capability(p_capability text) returns boolean
  language sql stable security invoker
as $$
  select case public.app_role()
    when 'admin' then p_capability in (
      'reports:moderate', 'news:moderate', 'inventory:write', 'hospitals:manage', 'roles:manage'
    )
    when 'moderator' then p_capability in ('reports:moderate', 'news:moderate')
    when 'hospital_staff' then p_capability = 'inventory:write'
    when 'citizen' then false
    else false          -- NULL (anonymous) or an unrecognized claim
  end;
$$;

-- ── role_assignments: append-only audit trail ────────────────────────────
--
-- app_metadata.role on the auth.users row stays the single source of truth
-- for authorization — this table never gates a request. It exists so that
-- "who made this person an admin, when, and why" has an answer, which a
-- claim overwritten in place cannot give.
--
-- No update or delete policy, and none intended: an audit row that can be
-- edited is not an audit row. The service role bypasses RLS and is what
-- apps/api writes with, so corrections are appended, never applied in
-- place.
create table if not exists role_assignments (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade on update cascade,
  -- NULL when the user had no explicit claim before this grant.
  previous_role text,
  new_role text not null,
  -- NULL only if the granting admin's account is later deleted; the audit
  -- row itself survives that (on delete set null, never cascade).
  assigned_by uuid references auth.users(id) on delete set null on update cascade,
  reason text,
  created_at timestamptz not null default now(),
  constraint role_assignments_new_role_valid
    check (new_role in ('citizen', 'hospital_staff', 'moderator', 'admin')),
  constraint role_assignments_previous_role_valid
    check (previous_role is null or previous_role in ('citizen', 'hospital_staff', 'moderator', 'admin'))
);

-- "Show me this user's grant history, newest first" is the only read
-- pattern, and it is the admin UI's per-user drill-down.
create index if not exists idx_role_assignments_user_created
  on role_assignments (user_id, created_at desc);

alter table role_assignments enable row level security;

-- Admins read the trail; nobody writes it through PostgREST. Every other
-- role — including the subject of the grant — is denied by default, since
-- no permissive policy covers them.
create policy role_assignments_select_admin on role_assignments for select
  using (public.has_capability('roles:manage'));

-- ── Re-point the capability-shaped policies at has_capability() ──────────
--
-- Same predicates as 20260815000012, expressed through the grant table so
-- a future role addition lands in one place. drop-then-create, never an
-- in-place edit of an applied migration.

drop policy if exists breeding_reports_update_moderation on breeding_reports;
create policy breeding_reports_update_moderation on breeding_reports for update
  using (public.has_capability('reports:moderate'));

drop policy if exists breeding_reports_select_moderation on breeding_reports;
create policy breeding_reports_select_moderation on breeding_reports for select
  using (public.has_capability('reports:moderate'));

drop policy if exists hospitals_insert_admin on hospitals;
create policy hospitals_insert_admin on hospitals for insert
  with check (public.has_capability('hospitals:manage'));

drop policy if exists hospitals_update_admin on hospitals;
create policy hospitals_update_admin on hospitals for update
  using (public.has_capability('hospitals:manage'));

drop policy if exists hospitals_delete_admin on hospitals;
create policy hospitals_delete_admin on hospitals for delete
  using (public.has_capability('hospitals:manage'));

drop policy if exists verified_hospital_staff_select on verified_hospital_staff;
create policy verified_hospital_staff_select on verified_hospital_staff for select
  using (public.has_capability('roles:manage') or user_id = auth.uid());

drop policy if exists verified_hospital_staff_insert_admin on verified_hospital_staff;
create policy verified_hospital_staff_insert_admin on verified_hospital_staff for insert
  with check (public.has_capability('roles:manage'));

drop policy if exists verified_hospital_staff_delete_admin on verified_hospital_staff;
create policy verified_hospital_staff_delete_admin on verified_hospital_staff for delete
  using (public.has_capability('roles:manage'));

drop policy if exists news_items_select_reviewed_public on news_items;
create policy news_items_select_reviewed_public on news_items for select
  using (reviewed = true or public.has_capability('news:moderate'));

drop policy if exists news_items_update_moderation on news_items;
create policy news_items_update_moderation on news_items for update
  using (public.has_capability('news:moderate'));

drop policy if exists news_items_delete_admin on news_items;
create policy news_items_delete_admin on news_items for delete
  using (public.has_capability('hospitals:manage'));

-- ── blood_inventory: role claim AND hospital membership ──────────────────
--
-- Membership in verified_hospital_staff stays the row-scoping check — it
-- is what stops one hospital's staff writing another's stock, and no role
-- claim can express that. The capability is added as a second, independent
-- condition so that revoking someone's hospital_staff role locks them out
-- immediately, without having to also find and delete their membership
-- rows. Admin satisfies the capability but still needs a membership row,
-- which is intentional: administering the system is not the same as being
-- authorized to state a hospital's blood stock.
drop policy if exists blood_inventory_insert_verified_staff on blood_inventory;
create policy blood_inventory_insert_verified_staff on blood_inventory for insert
  with check (
    public.has_capability('inventory:write')
    and auth.uid() in (
      select user_id from verified_hospital_staff
      where hospital_id = blood_inventory.hospital_id
    )
  );

drop policy if exists blood_inventory_update_verified_staff on blood_inventory;
create policy blood_inventory_update_verified_staff on blood_inventory for update
  using (
    public.has_capability('inventory:write')
    and auth.uid() in (
      select user_id from verified_hospital_staff
      where hospital_id = blood_inventory.hospital_id
    )
  );

-- apps/api reads and writes role_assignments with the service-role key,
-- which bypasses RLS. Guarded the same way 20260215000010's grants are —
-- the local postgis container has no such role.
do $$
begin
  grant select, insert on role_assignments to service_role;
  grant usage, select on sequence role_assignments_id_seq to service_role;
exception
  when undefined_object then
    raise notice 'service_role not present (local Postgres without Supabase auth bootstrap) — skipping grant.';
end $$;
