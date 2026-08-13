import { test, expect } from '@playwright/test';
import pg from 'pg';

/**
 * Schema tests against the local Postgres/PostGIS stack
 * (docs/PROJECT_PLAN.md §4). Every test skips itself, loudly, rather than
 * being reported as passed, when no database is reachable.
 */
const DEFAULT_LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/avash';
const databaseUrl = process.env.DATABASE_URL_LOCAL?.trim() || DEFAULT_LOCAL_DATABASE_URL;

let client: pg.Client | undefined;
let connectionError: string | undefined;

test.beforeAll(async () => {
  const candidate = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
  try {
    await candidate.connect();
    client = candidate;
  } catch (error) {
    connectionError = error instanceof Error ? error.message : String(error);
  }
});

test.afterAll(async () => {
  await client?.end();
});

function requireDb(): pg.Client {
  test.skip(!client, `no local database reachable at ${databaseUrl}: ${connectionError}`);
  return client as pg.Client;
}

const GEOMETRY_TABLES = ['regions', 'breeding_reports', 'hospitals', 'alert_subscriptions'];
const RLS_TABLES = [
  'regions',
  'weather_observations',
  'dengue_cases',
  'risk_predictions',
  'breeding_reports',
  'hospitals',
  'blood_inventory',
  'verified_hospital_staff',
  'alert_subscriptions',
  'push_subscriptions',
  'news_items',
];

test.describe('GiST indexes (§4.2)', () => {
  for (const table of GEOMETRY_TABLES) {
    test(`${table}.geom has a GiST index`, async () => {
      const db = requireDb();
      const { rows } = await db.query(
        `select indexname from pg_indexes where tablename = $1 and indexdef ilike '%gist%'`,
        [table]
      );
      expect(rows.length).toBeGreaterThan(0);
    });
  }
});

test.describe('Row Level Security (§4.1)', () => {
  test('RLS is enabled on all 11 product tables', async () => {
    const db = requireDb();
    const { rows } = await db.query(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r' and relname = any($1::text[])`,
      [RLS_TABLES]
    );
    expect(rows).toHaveLength(RLS_TABLES.length);
    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname} should have RLS enabled`).toBe(true);
    }
  });
});

test.describe('risk_level generated column (§14 RISK_LEVEL_BANDS)', () => {
  const cases: Array<[number, string]> = [
    [0.0, 'low'],
    [0.24, 'low'],
    [0.25, 'moderate'],
    [0.49, 'moderate'],
    [0.5, 'high'],
    [0.74, 'high'],
    [0.75, 'severe'],
    [1.0, 'severe'],
  ];

  for (const [score, expectedLevel] of cases) {
    test(`risk_score ${score} → ${expectedLevel}`, async () => {
      const db = requireDb();
      await db.query('begin');
      try {
        const region = await db.query(
          `insert into regions (code, name, admin_level, geom)
           values ($1, 'Schema Test Region', 1, ST_GeomFromText('MULTIPOLYGON(((0 0,0 1,1 1,1 0,0 0)))', 4326))
           returning id`,
          [`SCHEMA-TEST-${score}-${Date.now()}`]
        );
        const prediction = await db.query(
          `insert into risk_predictions (region_id, prediction_date, horizon_weeks, risk_score, model_version)
           values ($1, current_date, 2, $2, 'schema-test')
           returning risk_level`,
          [region.rows[0].id, score]
        );
        expect(prediction.rows[0].risk_level).toBe(expectedLevel);
      } finally {
        await db.query('rollback');
      }
    });
  }
});

test.describe('Check constraints reject out-of-range values', () => {
  test('risk_predictions rejects risk_score = 1.5', async () => {
    const db = requireDb();
    await db.query('begin');
    try {
      const region = await db.query(
        `insert into regions (code, name, admin_level, geom)
         values ('SCHEMA-TEST-CHECK-1', 'Check Test Region', 1, ST_GeomFromText('MULTIPOLYGON(((0 0,0 1,1 1,1 0,0 0)))', 4326))
         returning id`
      );
      await expect(
        db.query(
          `insert into risk_predictions (region_id, prediction_date, horizon_weeks, risk_score, model_version)
           values ($1, current_date, 2, 1.5, 'schema-test')`,
          [region.rows[0].id]
        )
      ).rejects.toThrow(/risk_score/);
    } finally {
      await db.query('rollback');
    }
  });

  test('alert_subscriptions rejects radius_m = 50 (below the 100 floor)', async () => {
    const db = requireDb();
    await db.query('begin');
    try {
      await expect(
        db.query(
          `insert into alert_subscriptions (user_id, geom, radius_m)
           values (gen_random_uuid(), ST_GeomFromText('POINT(0 0)', 4326), 50)`
        )
      ).rejects.toThrow(/radius_m/);
    } finally {
      await db.query('rollback');
    }
  });

  test('alert_subscriptions rejects radius_m = 25000 (above the 20,000 ceiling)', async () => {
    const db = requireDb();
    await db.query('begin');
    try {
      await expect(
        db.query(
          `insert into alert_subscriptions (user_id, geom, radius_m)
           values (gen_random_uuid(), ST_GeomFromText('POINT(0 0)', 4326), 25000)`
        )
      ).rejects.toThrow(/radius_m/);
    } finally {
      await db.query('rollback');
    }
  });

  test('blood_inventory rejects units_available = -1', async () => {
    const db = requireDb();
    await db.query('begin');
    try {
      const hospital = await db.query(
        `insert into hospitals (name, geom) values ('Schema Test Hospital', ST_GeomFromText('POINT(0 0)', 4326))
         returning id`
      );
      await expect(
        db.query(
          `insert into blood_inventory (hospital_id, blood_group, units_available)
           values ($1, 'A+', -1)`,
          [hospital.rows[0].id]
        )
      ).rejects.toThrow(/units_available/);
    } finally {
      await db.query('rollback');
    }
  });
});

test.describe('region_risk_summary materialized view', () => {
  test('has the unique index required for concurrent refresh', async () => {
    const db = requireDb();
    const { rows } = await db.query(
      `select indexname from pg_indexes where tablename = 'region_risk_summary' and indexname = 'uq_summary_region_horizon'`
    );
    expect(rows).toHaveLength(1);
  });

  test('refresh materialized view concurrently succeeds', async () => {
    const db = requireDb();
    await expect(db.query('refresh materialized view concurrently region_risk_summary;')).resolves.toBeDefined();
  });
});
