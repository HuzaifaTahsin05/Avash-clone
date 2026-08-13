#!/usr/bin/env -S node --experimental-strip-types
/**
 * Seeds a small, realistic dataset: a handful of regions with valid
 * MultiPolygon geometries, sample hospitals with blood_inventory rows, and
 * a short history of weather_observations + dengue_cases
 * (docs/PROJECT_PLAN.md §4).
 *
 * Idempotent: every insert either relies on a real unique constraint
 * (`regions.code`, `dengue_cases`'s `uq_cases_region_week`,
 * `blood_inventory`'s `(hospital_id, blood_group)`) with
 * `on conflict do nothing`, or — for the two tables with no natural
 * unique key (`hospitals`, `weather_observations`) — checks for an
 * existing row with the same seed-identifying columns before inserting.
 * Safe to run twice; running it twice produces zero duplicate rows.
 *
 * Targets DATABASE_URL_LOCAL by default (the local Postgres/PostGIS
 * container, docs/docker.md) — the same fallback the migration runner
 * uses. Against a real Supabase project, point DATABASE_URL_LOCAL at that
 * project's connection string; the writes go through a superuser-grade
 * role either way, the same bypass a service-role key gives on Supabase's
 * REST surface.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..');
const rootEnvFile = path.join(repoRoot, '.env');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const DEFAULT_LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/avash';
const databaseUrl = process.env.DATABASE_URL_LOCAL?.trim() || DEFAULT_LOCAL_DATABASE_URL;

interface RegionSeed {
  code: string;
  name: string;
  adminLevel: number;
  population: number;
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
}

const REGIONS: RegionSeed[] = [
  { code: 'BD-DHK', name: 'Dhaka', adminLevel: 2, population: 9540000, bbox: [90.32, 23.7, 90.45, 23.83] },
  { code: 'BD-CTG', name: 'Chattogram', adminLevel: 2, population: 2580000, bbox: [91.75, 22.3, 91.87, 22.42] },
  { code: 'BD-SYL', name: 'Sylhet', adminLevel: 2, population: 530000, bbox: [91.83, 24.87, 91.91, 24.93] },
];

const HOSPITALS: Array<{ regionCode: string; name: string; lon: number; lat: number }> = [
  { regionCode: 'BD-DHK', name: 'Dhaka Medical College Hospital', lon: 90.3958, lat: 23.7259 },
  { regionCode: 'BD-DHK', name: 'Bangabandhu Sheikh Mujib Medical University', lon: 90.3971, lat: 23.7381 },
  { regionCode: 'BD-CTG', name: 'Chattogram Medical College Hospital', lon: 91.8235, lat: 22.3599 },
  { regionCode: 'BD-SYL', name: 'Sylhet MAG Osmani Medical College Hospital', lon: 91.8687, lat: 24.8999 },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

function bboxToMultiPolygonWkt([minLon, minLat, maxLon, maxLat]: [number, number, number, number]): string {
  return `MULTIPOLYGON(((${minLon} ${minLat},${minLon} ${maxLat},${maxLon} ${maxLat},${maxLon} ${minLat},${minLon} ${minLat})))`;
}

function isoWeekStart(weeksAgo: number): string {
  const now = new Date();
  const day = now.getUTCDay() || 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - day + 1 - weeksAgo * 7);
  return monday.toISOString().slice(0, 10);
}

async function main() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const regionIds = new Map<string, string>();

    for (const region of REGIONS) {
      const wkt = bboxToMultiPolygonWkt(region.bbox);
      const { rows } = await client.query(
        `insert into regions (code, name, admin_level, population, geom)
         values ($1, $2, $3, $4, ST_GeomFromText($5, 4326))
         on conflict (code) do update set name = excluded.name
         returning id`,
        [region.code, region.name, region.adminLevel, region.population, wkt]
      );
      regionIds.set(region.code, rows[0].id);
    }
    console.log(`regions: ${regionIds.size} present`);

    let weatherInserted = 0;
    for (const region of REGIONS) {
      const regionId = regionIds.get(region.code);
      for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
        const observedAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
        const dayBucket = observedAt.slice(0, 10);

        const { rows: existing } = await client.query(
          `select 1 from weather_observations
           where region_id = $1 and observed_at::date = $2::date`,
          [regionId, dayBucket]
        );
        if (existing.length > 0) continue;

        await client.query(
          `insert into weather_observations
             (region_id, observed_at, temp_mean_c, temp_min_c, temp_max_c, humidity_pct, precipitation_mm, source)
           values ($1, $2, $3, $4, $5, $6, $7, 'seed')`,
          [regionId, observedAt, 28.5, 24.1, 33.2, 82.0, 4.5]
        );
        weatherInserted++;
      }
    }
    console.log(`weather_observations: ${weatherInserted} inserted this run`);

    let casesInserted = 0;
    for (const region of REGIONS) {
      const regionId = regionIds.get(region.code);
      for (let weeksAgo = 0; weeksAgo < 4; weeksAgo++) {
        const { rowCount } = await client.query(
          `insert into dengue_cases (region_id, reported_week, case_count, source)
           values ($1, $2, $3, 'seed')
           on conflict (region_id, reported_week) do nothing`,
          [regionId, isoWeekStart(weeksAgo), 10 + weeksAgo * 3]
        );
        casesInserted += rowCount ?? 0;
      }
    }
    console.log(`dengue_cases: ${casesInserted} inserted this run`);

    const hospitalIds = new Map<string, string>();
    for (const hospital of HOSPITALS) {
      const { rows: existing } = await client.query(`select id from hospitals where name = $1`, [hospital.name]);
      if (existing.length > 0) {
        hospitalIds.set(hospital.name, existing[0].id);
        continue;
      }
      const { rows } = await client.query(
        `insert into hospitals (name, geom, verified)
         values ($1, ST_GeomFromText($2, 4326), true)
         returning id`,
        [hospital.name, `POINT(${hospital.lon} ${hospital.lat})`]
      );
      hospitalIds.set(hospital.name, rows[0].id);
    }
    console.log(`hospitals: ${hospitalIds.size} present`);

    let inventoryInserted = 0;
    for (const [, hospitalId] of hospitalIds) {
      for (const bloodGroup of BLOOD_GROUPS.slice(0, 4)) {
        const { rowCount } = await client.query(
          `insert into blood_inventory (hospital_id, blood_group, units_available, platelet_units)
           values ($1, $2, $3, $4)
           on conflict (hospital_id, blood_group) do nothing`,
          [hospitalId, bloodGroup, 12, 4]
        );
        inventoryInserted += rowCount ?? 0;
      }
    }
    console.log(`blood_inventory: ${inventoryInserted} inserted this run`);

    console.log('seed complete');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
