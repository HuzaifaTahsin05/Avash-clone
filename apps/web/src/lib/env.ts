/**
 * Fail-fast validation for required `VITE_PUBLIC_*` vars (R2, §7.1).
 * A missing var throws a clear, actionable error at module load instead of
 * silently resolving to `undefined` deep inside a fetch call. Each var is
 * a static `import.meta.env.VITE_PUBLIC_*` access so the eslint-config
 * secrets-boundary rule (packages/config/eslint-config) can verify it.
 */
const apiBaseUrl = import.meta.env.VITE_PUBLIC_API_BASE_URL;
const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const turnstileSiteKey = import.meta.env.VITE_PUBLIC_TURNSTILE_SITE_KEY;

function requireVar(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". Copy apps/web/.env.example to apps/web/.env and set it.`
    );
  }
  return value;
}

export const env = {
  apiBaseUrl: requireVar('VITE_PUBLIC_API_BASE_URL', apiBaseUrl),
  supabaseUrl: requireVar('VITE_PUBLIC_SUPABASE_URL', supabaseUrl),
  supabaseAnonKey: requireVar('VITE_PUBLIC_SUPABASE_ANON_KEY', supabaseAnonKey),
  turnstileSiteKey: requireVar('VITE_PUBLIC_TURNSTILE_SITE_KEY', turnstileSiteKey),
};
