import { Hono } from 'hono';
import { latestWeatherResponseSchema, weatherHistoryResponseSchema } from '@avash/types';
import { buildGenericErrorBody } from '@avash/logger';
import type { AppEnv } from '../types';

/** `WEATHER_CACHE_TTL_S` (§14) — edge cache for weather reads. */
const WEATHER_CACHE_TTL_S = 'public, max-age=0, s-maxage=900, stale-while-revalidate=1800';
/** `WEATHER_HISTORY_WINDOW_DAYS` (§14) — dashboard history window; also the `?days=` ceiling. */
const WEATHER_HISTORY_WINDOW_DAYS = 14;

/**
 * Contract-shaped stubs. Final paths, query parsing, status codes, and
 * response shapes are locked in here; the database reads are filled in
 * during implementation. Every branch below already returns a
 * schema-valid body so a Phase 1 worker only ever replaces the empty
 * collection with a real one.
 */
export const weather = new Hono<AppEnv>()
  .get('/latest', (c) => {
    // ?regionCode= is accepted here so its presence doesn't 400 pre-implementation.
    const body = latestWeatherResponseSchema.parse({
      observations: [],
      generatedAt: new Date().toISOString(),
      requestId: c.get('requestId'),
    });
    c.header('Cache-Control', WEATHER_CACHE_TTL_S);
    return c.json(body, 200);
  })
  .get('/history', (c) => {
    const regionCode = c.req.query('regionCode');
    if (!regionCode) {
      return c.json(buildGenericErrorBody(c.get('requestId')), 400);
    }

    const rawDays = Number(c.req.query('days'));
    const windowDays =
      Number.isFinite(rawDays) && rawDays >= 1
        ? Math.min(rawDays, WEATHER_HISTORY_WINDOW_DAYS)
        : WEATHER_HISTORY_WINDOW_DAYS;

    const body = weatherHistoryResponseSchema.parse({
      regionCode,
      regionName: regionCode,
      windowDays,
      points: [],
      generatedAt: new Date().toISOString(),
      requestId: c.get('requestId'),
    });
    c.header('Cache-Control', WEATHER_CACHE_TTL_S);
    return c.json(body, 200);
  });
