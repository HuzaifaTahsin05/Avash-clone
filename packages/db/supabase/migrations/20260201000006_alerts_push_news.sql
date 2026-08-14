-- docs/PROJECT_PLAN.md §4 — proximity alerts, push delivery, news ingestion.

-- radius_m bounds mirror ALERT_PROXIMITY_RADIUS_DEFAULT_M (§14) exactly.
create table alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade on update cascade,
  geom geometry(Point, 4326) not null,
  radius_m integer not null default 2000 check (radius_m between 100 and 20000),
  active boolean default true,
  created_at timestamptz default now()
);
create index idx_alerts_geom on alert_subscriptions using gist (geom);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade on update cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz default now()
);

create table news_items (
  id bigint generated always as identity primary key,
  source_url text unique not null,
  title text,
  published_at timestamptz,
  region_guess uuid references regions(id) on delete set null on update cascade,
  ai_confidence numeric(3,2),
  flagged boolean default false,
  reviewed boolean default false,
  created_at timestamptz default now()
);
