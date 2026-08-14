// `supabase gen types typescript` needs a linked, hosted Supabase project
// (SUPABASE_PROJECT_REF + SUPABASE_ACCESS_TOKEN). No hosted project exists
// yet (docs/PROJECT_PLAN.md §0.4) — so until one does, the
// generated shape lives hand-written in packages/db/types.ts, kept in sync
// with packages/db/supabase/migrations by hand on every schema change, and
// re-exported through packages/types (R3). This script's job is to fail
// loudly rather than silently produce nothing, and to run the real
// generator once a project is linked.
const projectRef = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!projectRef || !accessToken) {
  console.log(
    'No hosted Supabase project linked (SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN unset).\n' +
      'Types are hand-maintained in packages/db/types.ts, matching\n' +
      'packages/db/supabase/migrations column-for-column, and re-exported\n' +
      'through packages/types (docs/data-schema/schema.md). Update both by\n' +
      'hand when a migration changes a column. Once a project is linked,\n' +
      'set both env vars and re-run this script to switch to the generator.'
  );
  process.exit(0);
}

const { execFileSync } = await import('node:child_process');
execFileSync(
  'supabase',
  ['gen', 'types', 'typescript', '--project-id', projectRef, '--schema', 'public'],
  { stdio: 'inherit', env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken } }
);
