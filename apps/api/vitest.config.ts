import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

/**
 * Runs inside workerd via Miniflare, not Node — the app under test is the
 * app that ships, with the same globals and the same Request/Response
 * (docs/standards/testing.md). CORS/env bindings mirror wrangler.toml's
 * [vars] shape but with test-safe values; no test reads a real credential.
 */
export default defineWorkersConfig({
  test: {
    name: 'api',
    include: ['test/**/*.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            ENVIRONMENT: 'test',
            CORS_ALLOWED_ORIGINS: 'https://avash.pages.dev',
            CORS_PREVIEW_ORIGIN_SUFFIX: 'avash.pages.dev',
            SUPABASE_URL: '',
            SUPABASE_SERVICE_ROLE_KEY: '',
          },
        },
      },
    },
  },
});
