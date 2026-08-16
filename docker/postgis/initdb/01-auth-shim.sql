-- LOCAL-ONLY shim, not part of the Supabase schema (docs/PROJECT_PLAN.md §4).
--
-- Every real Supabase project already has `auth.users` (managed by GoTrue).
-- This plain postgis/postgis container does not, and several `packages/db`
-- migrations declare foreign keys against `auth.users(id)`
-- (breeding_reports.reporter_id, blood_inventory.updated_by, etc.). Without
-- this stub those migrations cannot apply here at all.
--
-- Kept separate from 00-extensions.sql (whose comment scopes it to
-- "extensions Supabase already has enabled") because this table is not part
-- of the product schema — it never appears in packages/db/supabase/migrations
-- and is never applied against a real Supabase project, which manages this
-- schema itself. `auth.uid()`-driven RLS behavior against an actual
-- authenticated session is NOT exercised by this stub; that needs the
-- Supabase CLI's local stack (docs/PROJECT_PLAN.md §4.1).
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Minimal stand-ins for the two Supabase Auth SQL functions our RLS
-- policies call. Same signature/behavior as Supabase's real
-- implementation (reads the JWT claim Supavisor/PostgREST sets via
-- `request.jwt.claim.*` session settings) — a policy written against this
-- stub behaves the same way against real Supabase.
create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')::text;
$$;

-- Added for the app_role()/app_metadata custom-role mechanism
-- (packages/db/supabase/migrations/20260815000012_app_role_and_resource_reads.sql).
-- Matches Supabase's real auth.jwt() signature: the full decoded claims
-- object, read from the same request.jwt.claims session setting
-- Supavisor/PostgREST populates. LOCAL-ONLY, never applied to a real
-- Supabase project. initdb scripts only run on an empty volume, so
-- `pnpm docker:db:nuke` is required after editing this file.
create or replace function auth.jwt() returns jsonb
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb;
$$;
