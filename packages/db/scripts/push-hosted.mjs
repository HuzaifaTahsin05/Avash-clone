// Applies packages/db/supabase/migrations to a real hosted Supabase
// project (docs/manual-deploy.md § Service 3) via the `supabase` CLI.
// db:migrate (scripts/migrate.mjs) only ever targets local Postgres —
// this is the hosted counterpart, for first-time environment setup or
// pushing new migrations to preview/production by hand.
//
// Usage:
//   node scripts/push-hosted.mjs <project-ref> [--dry-run]
//   SUPABASE_PROJECT_REF=<ref> node scripts/push-hosted.mjs [--dry-run]
//
// Always run without --dry-run only after reading the dry-run output —
// this pushes to a shared, real database.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const projectRef = args.find((a) => !a.startsWith('--')) ?? process.env.SUPABASE_PROJECT_REF;

if (!projectRef) {
  console.error('usage: node scripts/push-hosted.mjs <project-ref> [--dry-run]');
  console.error('       (or set SUPABASE_PROJECT_REF)');
  process.exitCode = 1;
} else if (!/^[a-z0-9]+$/.test(projectRef)) {
  // Supabase project refs are lowercase alphanumeric only. Rejecting
  // anything else keeps this safe to pass through execFileSync's
  // Windows shell (args are concatenated, not escaped, there).
  console.error(`invalid project ref: ${projectRef}`);
  process.exitCode = 1;
} else {
  const run = (cliArgs) =>
    execFileSync('supabase', cliArgs, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

  run(['link', '--project-ref', projectRef]);
  run(['db', 'push', ...(dryRun ? ['--dry-run'] : [])]);
}
