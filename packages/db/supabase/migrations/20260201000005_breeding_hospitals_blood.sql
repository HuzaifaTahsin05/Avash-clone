-- docs/PROJECT_PLAN.md §4 — citizen reports + medical resources.

create table breeding_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null on update cascade,
  geom geometry(Point, 4326) not null,
  description text,
  photo_url text,
  ai_validation jsonb,                  -- Gemini structured-output payload
  status text not null default 'pending'
    check (status in ('pending','verified','rejected','resolved')),
  verified_by uuid references auth.users(id) on delete set null on update cascade,
  municipal_ref_id text,
  created_at timestamptz default now()
);
create index idx_breeding_geom on breeding_reports using gist (geom);
-- Partial index: the moderation queue only ever scans pending reports.
create index idx_breeding_pending on breeding_reports (status) where status = 'pending';

create table hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  geom geometry(Point, 4326) not null,
  address text,
  phone text,
  verified boolean default false,
  updated_at timestamptz default now()
);
create index idx_hospitals_geom on hospitals using gist (geom);

create type blood_group as enum ('A+','A-','B+','B-','AB+','AB-','O+','O-');

create table blood_inventory (
  id bigint generated always as identity primary key,
  hospital_id uuid references hospitals(id) on delete cascade on update cascade,
  blood_group blood_group not null,
  units_available integer not null default 0 check (units_available >= 0),
  platelet_units integer default 0 check (platelet_units >= 0),
  updated_by uuid references auth.users(id) on delete set null on update cascade,
  updated_at timestamptz default now(),
  unique (hospital_id, blood_group)
);

create table verified_hospital_staff (
  user_id uuid references auth.users(id) on delete cascade on update cascade,
  hospital_id uuid references hospitals(id) on delete cascade on update cascade,
  primary key (user_id, hospital_id)
);
