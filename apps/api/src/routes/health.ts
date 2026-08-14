import { Hono } from 'hono';
import { healthResponseSchema, healthDbResponseSchema } from '@avash/types';
import { createSupabaseAdmin } from '../lib/supabaseAdmin';
import type { AppEnv } from '../types';

/**
 * Liveness probe — no DB, no network call, so CI can exercise it without
 * live database credentials. `/health/db`, below, is a separate
 * readiness probe; a failure there never affects this one.
 */
export const health = new Hono<AppEnv>().get('/', (c) => {
  const body = healthResponseSchema.parse({
    status: 'ok',
    version: '1.0.0',
    environment: c.env.ENVIRONMENT ?? 'development',
    timestamp: new Date().toISOString(),
    requestId: c.get('requestId'),
  });
  return c.json(body, 200);
});

/**
 * Readiness probe — a trivial bounded query against `regions`
 * proves the service-role key and Supabase project are reachable. Any
 * failure (network, auth, missing table) collapses to the same generic
 * `ready: false` shape; the real cause is never echoed back (R4/R10).
 */
health.get('/db', async (c) => {
  const requestId = c.get('requestId');

  try {
    const supabase = createSupabaseAdmin(c.env);
    const { error } = await supabase.from('regions').select('id').limit(1);

    const body = healthDbResponseSchema.parse({
      ready: !error,
      reason: error ? 'database unreachable' : null,
      requestId,
    });
    return c.json(body, error ? 503 : 200);
  } catch {
    const body = healthDbResponseSchema.parse({
      ready: false,
      reason: 'database unreachable',
      requestId,
    });
    return c.json(body, 503);
  }
});
