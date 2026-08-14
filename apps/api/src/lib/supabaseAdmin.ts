import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Bindings } from '../types';

/**
 * Service-role Supabase client, built fresh per request from the Worker's
 * own `env` (never a module-level singleton — Workers can be reused across
 * requests with different `env` in tests, and a cached client would leak
 * one request's bindings into another). The service-role key bypasses RLS
 * and must never reach `apps/web` (R2) — this file only ever runs in
 * `apps/api`.
 *
 * Talks to Supabase over its REST (PostgREST) interface, not a raw
 * Postgres TCP connection — Supavisor transaction-mode pooling is what
 * that REST endpoint sits in front of on Supabase's side, so no
 * long-lived connection is held by the Worker (docs/standards/backend.md).
 */
/**
 * `options.fetch` lets route tests inject a fake PostgREST double instead
 * of hitting a live database — `compose.yaml` runs no local PostgREST, and
 * `@cloudflare/vitest-pool-workers` gives module mocking too narrow a
 * surface to lean on. Works identically in workerd and Node.
 */
export function createSupabaseAdmin(env: Bindings, options?: { fetch?: typeof fetch }): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(options?.fetch ? { global: { fetch: options.fetch } } : {}),
  });
}
