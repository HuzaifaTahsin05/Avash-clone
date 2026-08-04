import { Hono } from 'hono';
import { healthResponseSchema } from '@avash/types';
import type { AppEnv } from '../types';

/**
 * Liveness probe only — no DB, no network call, so CI can exercise it
 * without live database credentials. The database schema work extends
 * this surface with a separate `/health/db` readiness probe; nothing here
 * gets rewritten to add it.
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
