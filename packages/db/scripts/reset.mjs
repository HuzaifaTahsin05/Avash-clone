// Drops every product object from the `public` schema and re-runs every
// migration from scratch. Local/CI use only — refuses to run against
// anything that isn't the local container's default database name, so a
// mistyped DATABASE_URL_LOCAL can't wipe a real project.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resolveDatabaseUrl } from './lib/connection.mjs';

const migrateScript = path.resolve(fileURLToPath(import.meta.url), '../migrate.mjs');

const databaseUrl = resolveDatabaseUrl();

if (!/\/(avash)(\?|$)/.test(databaseUrl) || !/127\.0\.0\.1|localhost/.test(databaseUrl)) {
  console.error(
    'db:reset refuses to run against a non-local database. ' +
      'DATABASE_URL_LOCAL must point at 127.0.0.1/localhost and database "avash".'
  );
  process.exit(1);
}

async function main() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('drop schema if exists public cascade;');
    await client.query('create schema public;');
    console.log('public schema dropped and recreated');
  } finally {
    await client.end();
  }
}

main()
  .then(() => {
    const result = spawnSync(process.execPath, [migrateScript], { stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
