import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../../..');
const rootEnvFile = path.join(repoRoot, '.env');

// Root .env is gitignored and optional (CI supplies DATABASE_URL_LOCAL as a
// real env var instead). Loading is best-effort — never fail because a
// dev's machine has no .env yet.
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

export const DEFAULT_LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/avash';

export function resolveDatabaseUrl() {
  return process.env.DATABASE_URL_LOCAL?.trim() || DEFAULT_LOCAL_DATABASE_URL;
}
