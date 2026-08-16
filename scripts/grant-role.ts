/**
 * Out-of-band role grant — the bootstrap path for the first admin.
 *
 * `PATCH /api/admin/users/:id/role` requires `roles:manage`, which only an
 * admin has, so a project with zero admins cannot make one through the
 * app. This script is that escape hatch, and it is also the recovery path
 * if every admin is locked out.
 *
 * Runs against Supabase's Admin API with the service-role key from the
 * repo-root `.env` — never from a browser, never from `apps/api` (R2).
 * It writes the same `app_metadata.role` claim and the same
 * `role_assignments` audit row the route does, so a bootstrap grant is
 * not invisible in the trail; `assigned_by` is null, which is exactly what
 * "granted out of band" should look like.
 *
 *   pnpm role:grant -- --email someone@example.com --role admin
 *   pnpm role:grant -- --user-id <uuid> --role moderator --reason "on-call rota"
 *   pnpm role:grant -- --list
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { appRoleSchema, type AppRole } from '@avash/types';

// Same loader as scripts/seed-db.ts — this file lives at
// <repoRoot>/scripts/, so '../..' is the repo root, not '..'.
const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../..');
const rootEnvFile = path.join(repoRoot, '.env');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

interface Args {
  email?: string;
  userId?: string;
  role?: string;
  reason?: string;
  list: boolean;
}

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

const VALUE_FLAGS = {
  '--email': 'email',
  '--user-id': 'userId',
  '--role': 'role',
  '--reason': 'reason',
} as const;

function parseArgs(argv: string[]): Args {
  const args: Args = { list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--list') {
      args.list = true;
      continue;
    }
    const key = VALUE_FLAGS[flag as keyof typeof VALUE_FLAGS];
    if (!key) continue;
    const value = argv[i + 1];
    // A flag whose value is missing or is itself a flag is a typo, not an
    // empty value — refusing beats silently granting the wrong thing.
    if (!value || value.startsWith('--')) {
      fail(`${flag} needs a value.`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  fail(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the repo-root .env.\n' +
      '    Against the local stack these are the values `pnpm docker:supabase` prints;\n' +
      '    against a hosted project, Dashboard → Project Settings → API.'
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Paged so a project with more than one page of users still resolves an email. */
async function findUserByEmail(email: string): Promise<{ id: string; app_metadata: unknown } | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 40; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Could not list users: ${error.message}`);
    const users = data?.users ?? [];
    const match = users.find((user) => user?.email?.toLowerCase() === target);
    if (match?.id) return { id: match.id, app_metadata: match?.app_metadata };
    if (users.length < 200) return null;
  }
  return null;
}

async function listUsers(): Promise<void> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) fail(`Could not list users: ${error.message}`);
  const users = data?.users ?? [];
  if (users.length === 0) {
    console.log('\n  No users yet — sign one up through the app first.\n');
    return;
  }
  console.log('\n  role            email');
  console.log('  ─────────────── ──────────────────────────────────────────');
  for (const user of users) {
    const metadata = user?.app_metadata as Record<string, unknown> | undefined;
    const role = typeof metadata?.role === 'string' ? metadata.role : 'citizen';
    console.log(`  ${role.padEnd(15)} ${user?.email ?? '(no email)'}`);
  }
  console.log('');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    await listUsers();
    return;
  }

  if (!args.role) {
    fail('--role is required. One of: ' + appRoleSchema.options.join(', ') + '. Or pass --list.');
  }
  const roleResult = appRoleSchema.safeParse(args.role);
  if (!roleResult.success) {
    fail(`"${args.role}" is not a role. One of: ${appRoleSchema.options.join(', ')}.`);
  }
  const role: AppRole = roleResult.data;

  if (!args.email && !args.userId) {
    fail('Pass --email or --user-id to identify the account.');
  }

  const found = args.userId
    ? await supabase.auth.admin
        .getUserById(args.userId)
        .then((result) =>
          result?.data?.user?.id ? { id: result.data.user.id, app_metadata: result.data.user?.app_metadata } : null
        )
    : await findUserByEmail(args.email as string);

  if (!found) {
    fail(`No account found for ${args.email ?? args.userId}. They must sign up before a role can be granted.`);
  }

  const metadata = (typeof found.app_metadata === 'object' && found.app_metadata !== null ? found.app_metadata : {}) as Record<
    string,
    unknown
  >;
  const previousRole = typeof metadata?.role === 'string' ? metadata.role : 'citizen';

  // Merge, never replace — app_metadata also carries Supabase's own
  // provider/providers keys.
  const { error: updateError } = await supabase.auth.admin.updateUserById(found.id, {
    app_metadata: { ...metadata, role },
  });
  if (updateError) fail(`Could not set the role: ${updateError.message}`);

  const { error: auditError } = await supabase.from('role_assignments').insert({
    user_id: found.id,
    previous_role: previousRole,
    new_role: role,
    assigned_by: null, // out-of-band grant, by definition no acting admin
    reason: args.reason ?? 'granted via scripts/grant-role.ts',
  });
  if (auditError) {
    console.warn(`\n  ! Role was set, but the audit row failed to write: ${auditError.message}`);
  }

  console.log(`\n  ✓ ${args.email ?? found.id}: ${previousRole} → ${role}`);
  console.log('    They must sign out and back in — the claim is baked into the JWT at issue time.\n');
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
