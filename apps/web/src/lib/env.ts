/**
 * Fail-fast validation for required `VITE_PUBLIC_*` vars (R2, §7.1).
 * A missing var throws a clear, actionable error at module load instead of
 * silently resolving to `undefined` deep inside a fetch call. Each var is
 * a static `import.meta.env.VITE_PUBLIC_*` access so the eslint-config
 * secrets-boundary rule (packages/config/eslint-config) can verify it.
 */
const apiBaseUrl = import.meta.env.VITE_PUBLIC_API_BASE_URL;

if (!apiBaseUrl) {
  throw new Error(
    'Missing required environment variable "VITE_PUBLIC_API_BASE_URL". Copy apps/web/.env.example to apps/web/.env and set it.'
  );
}

export const env = {
  apiBaseUrl,
};
