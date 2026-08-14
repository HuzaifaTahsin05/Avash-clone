-- docs/PROJECT_PLAN.md §4 — extensions + administrative boundaries.
create extension if not exists postgis;
create extension if not exists pgcrypto;

create table regions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  admin_level smallint not null,        -- 1=state 2=district 3=ward
  population integer,
  geom geometry(MultiPolygon, 4326) not null
);
create index idx_regions_geom on regions using gist (geom);
