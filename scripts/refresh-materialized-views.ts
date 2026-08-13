#!/usr/bin/env -S node --experimental-strip-types
/**
 * `refresh materialized view concurrently region_risk_summary`
 * (docs/PROJECT_PLAN.md §4). `concurrently` requires the unique
 * index `uq_summary_region_horizon` from
 * packages/db/supabase/migrations/20260201000004_region_risk_summary_mv.sql
 * — without it this errors at runtime rather than falling back to a
 * blocking refresh, which is deliberate: a silent fallback would let the
 * map read path start blocking on every prediction run without anyone
 * noticing until it did.
 *
 * Invoked by ml/serving/predict.py after every batch-predict run
 * (MV_REFRESH_INTERVAL, §14) — this script exists so that invocation, and
 * a manual/CI re-run, share one implementation instead of two.
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

async function main() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('refresh materialized view concurrently region_risk_summary;');
    console.log('region_risk_summary refreshed (concurrently)');
  } catch (error) {
    console.error('region_risk_summary refresh failed:', error instanceof Error ? error.message : error);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(() => {
  process.exitCode = 1;
});
