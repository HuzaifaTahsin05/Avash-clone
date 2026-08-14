#!/usr/bin/env -S node --experimental-strip-types
/**
 * Weather ingest job (docs/PROJECT_PLAN.md §4, ADR-007) — a scheduled
 * GitHub Actions job, never an HTTP endpoint. Reads every region's
 * centroid from `region_ingest_targets`, pulls current conditions from
 * OpenWeatherMap, and appends one row per region into
 * `weather_observations` via Supabase's PostgREST surface
 * (`@supabase/supabase-js` + the service-role key), not a raw Postgres
 * connection — unlike scripts/seed-db.ts, which is local-only `pg`.
 *
 * One region failing must never abandon the rest: each region is
 * fetched/inserted independently and outcomes are counted, not thrown.
 * Exit code and the final summary line reflect the aggregate:
 *   - exit 0 when at least one region was freshly ingested or already had
 *     this hour's observation (real progress happened, this run or a
 *     prior one)
 *   - exit 1 when every region was skipped or failed — including the
 *     case where every region hits the same non-retryable upstream
 *     status (e.g. a revoked OpenWeatherMap key returning 401 for all of
 *     them), which must not look like a healthy no-op run
 *
 * Never logs the OpenWeatherMap request URL (docs/security/secrets-matrix.md)
 * — the API key rides in the query string. Region codes are logged instead.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import type { RegionIngestTargetRow } from '@avash/types';
import { backoffDelayMs } from './lib/backoff.ts';
import { fetchWeatherWithRetry } from './lib/fetchWithRetry.ts';
import { hourBucketEnd, hourBucketStart } from './lib/hourBucket.ts';
import { mapObservation } from './lib/mapObservation.ts';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const rootEnvFile = path.join(repoRoot, '.env');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

// docs/constants-registry.md — both registered against this file.
const WEATHER_INGEST_REQUEST_SPACING_MS = 1100;
const WEATHER_INGEST_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildWeatherUrl(lat: number, lon: number, apiKey: string): string {
  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('units', 'metric');
  url.searchParams.set('appid', apiKey);
  return url.toString();
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const openWeatherMapApiKey = process.env.OPENWEATHERMAP_API_KEY?.trim();

  const missing: string[] = [];
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!openWeatherMapApiKey) missing.push('OPENWEATHERMAP_API_KEY');
  if (missing.length > 0) {
    console.error(`weather-ingest: missing required environment variable(s): ${missing.join(', ')}. Set them in the root .env (see .env.example) or as job secrets before running.`);
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(supabaseUrl as string, supabaseServiceRoleKey as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: targets, error: targetsError } = await supabase.from('region_ingest_targets').select('region_id, code, name, lat, lon');

  if (targetsError) {
    console.error('weather-ingest: failed to read region_ingest_targets (see Supabase project logs for detail).');
    process.exitCode = 1;
    return;
  }

  const regions = (targets ?? []) as RegionIngestTargetRow[];
  if (regions.length === 0) {
    console.log('weather-ingest: 0 regions in region_ingest_targets — nothing to do.');
    process.exitCode = 0;
    return;
  }

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;
  // Distinct from `skipped` (an upstream non-retryable status, e.g. a
  // revoked OpenWeatherMap key returning 401 on every region) — this is
  // the healthy idempotent no-op when a region already has an
  // observation for the current hour bucket. Conflating the two under
  // one counter let a fully-broken run (every region 401ing) exit 0
  // exactly like a fully-healthy rerun (every region already ingested),
  // so the cron stayed green while ingesting nothing.
  let alreadyPresent = 0;

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    if (!region?.region_id || typeof region.lat !== 'number' || typeof region.lon !== 'number') {
      console.error(`weather-ingest: [${region?.code ?? 'unknown'}] malformed ingest target row, skipping.`);
      failed++;
      continue;
    }

    if (i > 0) {
      await sleep(WEATHER_INGEST_REQUEST_SPACING_MS);
    }

    const url = buildWeatherUrl(region.lat, region.lon, openWeatherMapApiKey as string);
    const outcome = await fetchWeatherWithRetry(fetch, url, {
      maxAttempts: WEATHER_INGEST_MAX_RETRIES,
      delayFn: backoffDelayMs,
      sleep,
    });

    if (outcome.status === 'skipped') {
      console.log(`weather-ingest: [${region.code}] skipped (${outcome.reason}).`);
      skipped++;
      continue;
    }
    if (outcome.status === 'failed') {
      console.error(`weather-ingest: [${region.code}] failed after retries (${outcome.reason}).`);
      failed++;
      continue;
    }

    const row = mapObservation(region.region_id, outcome.payload);
    const bucketStart = hourBucketStart(row.observed_at);
    const bucketEnd = hourBucketEnd(bucketStart);

    const { data: existing, error: existingError } = await supabase
      .from('weather_observations')
      .select('id')
      .eq('region_id', region.region_id)
      .gte('observed_at', bucketStart)
      .lt('observed_at', bucketEnd)
      .limit(1);

    if (existingError) {
      console.error(`weather-ingest: [${region.code}] dedupe check failed, not inserting.`);
      failed++;
      continue;
    }

    if ((existing?.length ?? 0) > 0) {
      console.log(`weather-ingest: [${region.code}] already has an observation this hour, skipping.`);
      alreadyPresent++;
      continue;
    }

    const { error: insertError } = await supabase.from('weather_observations').insert(row);
    if (insertError) {
      console.error(`weather-ingest: [${region.code}] insert failed.`);
      failed++;
      continue;
    }

    console.log(`weather-ingest: [${region.code}] ingested.`);
    succeeded++;
  }

  const total = regions.length;
  console.log(
    `ingested ${succeeded}/${total} regions (already present: ${alreadyPresent}, skipped: ${skipped}, failed: ${failed})`
  );

  // Zero progress this run — no fresh insert and no confirmed prior
  // presence — is a failure regardless of whether individual regions
  // landed in `skipped` or `failed`. A revoked/expired OpenWeatherMap key
  // makes every region 401 → `skipped`, which must not look identical to
  // "every region already had this hour's data."
  process.exitCode = succeeded + alreadyPresent > 0 ? 0 : 1;
}

main().catch((error) => {
  console.error('weather-ingest: unexpected failure —', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
