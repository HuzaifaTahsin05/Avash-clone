-- docs/PROJECT_PLAN.md §4 — weather ingestion + historical case ground truth.

-- Append-only: rows are written once by scripts/jobs/weather-ingest.ts and
-- never updated or deleted (docs/PROJECT_PLAN.md §6).
create table weather_observations (
  id bigint generated always as identity primary key,
  region_id uuid references regions(id) on delete cascade on update cascade,
  observed_at timestamptz not null,
  temp_mean_c numeric(4,1),
  temp_min_c numeric(4,1),
  temp_max_c numeric(4,1),
  humidity_pct numeric(4,1),
  precipitation_mm numeric(6,1),
  source text default 'openweathermap',
  raw_payload jsonb
);
-- "Latest record per entity" composite index (§4.2).
create index idx_weather_region_time on weather_observations (region_id, observed_at desc);

create table dengue_cases (
  id bigint generated always as identity primary key,
  region_id uuid references regions(id) on delete cascade on update cascade,
  reported_week date not null,          -- ISO week start (Monday)
  case_count integer not null check (case_count >= 0),
  source text
);
create unique index uq_cases_region_week on dengue_cases (region_id, reported_week);
