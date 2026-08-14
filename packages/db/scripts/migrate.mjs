// Applies every *.sql file in packages/db/supabase/migrations, in
// filename order, exactly once — tracked in a `_migrations` table so a
// re-run only applies what's new (docs/PROJECT_PLAN.md §4).
//
// Targets the local Postgres/PostGIS container by default
// (DATABASE_URL_LOCAL, docs/docker.md). Pointed at a real Supabase
// project's connection string, the same migrations apply unchanged.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resolveDatabaseUrl } from './lib/connection.mjs';

const migrationsDir = path.resolve(fileURLToPath(import.meta.url), '../../supabase/migrations');

async function main() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();

  try {
    await client.query(`
      create table if not exists _migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const { rows } = await client.query('select filename from _migrations');
    const applied = new Set(rows.map((r) => r.filename));

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into _migrations (filename) values ($1)', [file]);
        await client.query('commit');
        console.log(`applied: ${file}`);
        appliedCount += 1;
      } catch (error) {
        await client.query('rollback');
        console.error(`FAILED: ${file}`);
        throw error;
      }
    }

    if (appliedCount === 0) {
      console.log(`up to date — ${files.length} migration(s), nothing new to apply`);
    } else {
      console.log(`applied ${appliedCount} new migration(s), ${files.length} total`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
