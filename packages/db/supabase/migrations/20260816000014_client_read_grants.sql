-- Object-level SELECT grants for the two tables the BROWSER reads
-- directly. Without these the moderation queue could never load and the
-- blood-inventory ticker could never receive a Realtime change, no matter
-- what the RLS policies said.
--
-- Why this was missing: 20260215000010_service_role_grants.sql found that
-- this project's default privileges only auto-grant
-- TRUNCATE/REFERENCES/TRIGGER on new objects — never
-- SELECT/INSERT/UPDATE/DELETE — and fixed that for `service_role`, which
-- is what `apps/api` and the jobs authenticate as. `anon` and
-- `authenticated` were never given the same treatment, because at that
-- point every read went through `apps/api`. Two features have since been
-- built on deliberate direct-from-browser reads, and both were shipped
-- against RLS policies that Postgres never got as far as evaluating.
--
-- GRANT and RLS are independent checks and Postgres applies GRANT first.
-- A missing grant surfaces as PostgREST 42501 "permission denied for
-- table", which the UI renders as its generic "unable to load" — the same
-- text an empty queue or a network failure produces, which is why this
-- was invisible.
--
-- Deliberately NOT `grant ... on all tables in schema public`, and
-- deliberately no `alter default privileges` for these two roles: every
-- other table is service-role-only by design, and a blanket grant would
-- silently expose each future table to the browser, leaving RLS as the
-- only thing between a new table and the public internet. Each row below
-- is a table someone chose to expose, and adding one should stay a
-- deliberate edit here.
--
-- SELECT only. No client-side INSERT/UPDATE/DELETE grant exists on any
-- table: anonymous report creation goes through `apps/api` so it can be
-- Turnstile- and rate-limit-gated (ADR-005), and inventory writes go
-- through `apps/api` so the verified-staff check runs (§7.2). Those write
-- paths must not become reachable directly from a browser.

do $$
begin
  -- breeding_reports: the moderation queue reads pending rows straight
  -- from Supabase (decision F, docs/features/breeding-reports.md). Row
  -- filtering stays entirely with RLS —
  -- `breeding_reports_select_verified_or_own` for an ordinary user and
  -- `breeding_reports_select_moderation` (has_capability('reports:moderate'))
  -- for the queue itself. `authenticated` only: no signed-out page reads
  -- this table today, and granting `anon` would widen the surface for a
  -- feature that does not exist.
  grant select on breeding_reports to authenticated;

  -- blood_inventory: the public ticker subscribes to postgres_changes
  -- from the browser (ADR-010). Realtime enforces RLS on each change it
  -- ships, but it still needs the object grant to read the row at all.
  -- `anon` as well as `authenticated`, because the ticker is public and
  -- its RLS select policy is `using (true)`.
  grant select on blood_inventory to anon, authenticated;

  -- role_assignments: makes `role_assignments_select_admin` (added in
  -- 20260816000013) an actually-reachable policy rather than a dead one,
  -- so the audit trail can be surfaced to an admin without a further
  -- migration. RLS still restricts every row to has_capability('roles:manage');
  -- the grant alone exposes nothing.
  grant select on role_assignments to authenticated;
exception
  when undefined_object then
    raise notice 'anon/authenticated role not present (local Postgres without Supabase auth bootstrap) — skipping grants.';
end $$;
