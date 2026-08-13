/**
 * Node entry point for the apps/api container image (ADR-012).
 *
 * Production runs on Cloudflare's workerd via `wrangler deploy`; this file
 * exists only so the same app can run in a portable container. It serves
 * the SAME app object exported by ../src/index.ts — no fork, no runtime
 * branching inside src/. Everything Node-specific lives here and is typed
 * by tsconfig.node.json, keeping Node types out of Worker source.
 */
import { serve } from '@hono/node-server';
import app from '../src/index';
import type { Bindings } from '../src/types';

/** In-container port (`APP_CONTAINER_PORTS`, docs/PROJECT_PLAN.md §14). */
const DEFAULT_PORT = 8787;

/**
 * Deploy-time config read on every request. A missing value here is a
 * misconfiguration, not a degraded mode: an empty CORS allow-list rejects
 * every browser origin, which is a miserable failure to diagnose from
 * outside the container.
 */
const REQUIRED_VARS = ['CORS_ALLOWED_ORIGINS'] as const;

/**
 * Secrets. No route consumes one yet, so they default to empty and the
 * image still answers /health without a full secret set. The startup log
 * names the unset ones so an operator learns it here instead of from a
 * 500 later.
 */
const OPTIONAL_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'GEMINI_API_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'TURNSTILE_SECRET_KEY',
] as const;

function readBindings(): Bindings {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. See docs/security/secrets-matrix.md.`
    );
  }

  const unset = OPTIONAL_VARS.filter((name) => !process.env[name]);
  if (unset.length > 0) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: 'Starting with unset optional environment variables',
        variables: unset,
      })
    );
  }

  return {
    SUPABASE_URL: process.env.SUPABASE_URL ?? '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET ?? '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ?? '',
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY ?? '',
    ENVIRONMENT: process.env.ENVIRONMENT ?? 'development',
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS ?? '',
    CORS_PREVIEW_ORIGIN_SUFFIX: process.env.CORS_PREVIEW_ORIGIN_SUFFIX ?? '',
  };
}

/**
 * workerd hands every request an ExecutionContext; @hono/node-server does
 * not. A route calling waitUntil() must not crash under Node, so this runs
 * the promise fire-and-forget and swallows rejection the way a detached
 * Worker task would.
 */
const executionCtx = {
  waitUntil(promise: Promise<unknown>): void {
    void Promise.resolve(promise).catch(() => undefined);
  },
  passThroughOnException(): void {
    // No Cloudflare origin to fall through to. A thrown error is handled
    // by the app's own onError boundary (§9, R10).
  },
  props: undefined,
};

const bindings = readBindings();
const port = Number(process.env.PORT ?? DEFAULT_PORT);

serve(
  {
    fetch: (request: Request) => app.fetch(request, bindings, executionCtx),
    port,
    hostname: '0.0.0.0',
  },
  (info) => {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'apps/api listening on the Node runtime (ADR-012)',
        port: info.port,
        environment: bindings.ENVIRONMENT,
      })
    );
  }
);
