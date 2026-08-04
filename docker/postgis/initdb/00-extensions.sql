-- Runs once, when the `db` service initializes an empty data volume
-- (`docker compose down -v` then `up` re-runs it).
--
-- Scope: the extensions Supabase already has enabled on a managed
-- project, so a migration written against Supabase applies unchanged
-- against this container. Nothing else belongs here — every table, index,
-- RLS policy, and materialized view lives in
-- `packages/db/supabase/migrations/`, never in this file. If a schema
-- object appears here, the container and Supabase have silently diverged.

create extension if not exists postgis;
create extension if not exists pgcrypto;
