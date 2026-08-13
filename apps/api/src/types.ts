export interface Bindings {
  /** Project URL — not secret (docs/security/secrets-matrix.md), but read server-side only under this name. */
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  GEMINI_API_KEY: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  TURNSTILE_SECRET_KEY: string;
  ENVIRONMENT: string;
  /** Comma-separated exact origins, e.g. "https://avash.pages.dev" (§14 `CORS_ALLOWED_ORIGINS`). */
  CORS_ALLOWED_ORIGINS: string;
  /** Bare domain suffix PR-preview origins must end in, e.g. "avash.pages.dev" (no scheme, no leading dot). */
  CORS_PREVIEW_ORIGIN_SUFFIX: string;
}

export interface Variables {
  requestId: string;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: Variables;
}
