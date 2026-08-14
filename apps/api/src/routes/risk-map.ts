import { Hono } from 'hono';
import { z } from 'zod';
import { riskMapResponseSchema, horizonWeeksSchema, RISK_MAP_DEFAULT_HORIZON_WEEKS } from '@avash/types';
import { buildGenericErrorBody } from '@avash/logger';
import { parseBbox } from '@avash/geo';
import type { AppEnv } from '../types';

/** `RISK_MAP_CACHE_TTL_S` (§14) — edge cache for risk-map reads. */
const RISK_MAP_CACHE_TTL_S = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600';

const regionIdParamSchema = z.string().uuid();

function parseHorizon(raw: string | undefined): { ok: true; horizonWeeks: 2 | 4 } | { ok: false } {
  if (raw === undefined) {
    return { ok: true, horizonWeeks: RISK_MAP_DEFAULT_HORIZON_WEEKS };
  }
  const parsed = horizonWeeksSchema.safeParse(Number(raw));
  return parsed.success ? { ok: true, horizonWeeks: parsed.data } : { ok: false };
}

/**
 * `GET /api/risk-map` — contract-shaped stub. Final query parsing, status
 * codes, and response shape are locked in here; the read from
 * `region_risk_geojson` is filled in during implementation.
 */
export const riskMap = new Hono<AppEnv>().get('/', (c) => {
  const horizon = parseHorizon(c.req.query('horizon'));
  if (!horizon.ok) {
    return c.json(buildGenericErrorBody(c.get('requestId')), 400);
  }

  const bboxRaw = c.req.query('bbox');
  if (bboxRaw !== undefined && !parseBbox(bboxRaw).ok) {
    return c.json(buildGenericErrorBody(c.get('requestId')), 400);
  }

  const body = riskMapResponseSchema.parse({
    type: 'FeatureCollection',
    features: [],
    horizonWeeks: horizon.horizonWeeks,
    generatedAt: null,
    requestId: c.get('requestId'),
  });
  c.header('Cache-Control', RISK_MAP_CACHE_TTL_S);
  return c.json(body, 200);
});

/**
 * `GET /api/risk/:regionId` — contract-shaped stub. A malformed UUID is a
 * generic 400 before any I/O; a well-formed-but-unknown region 404s once
 * the real read replaces this stub's unconditional empty result.
 */
export const riskDetail = new Hono<AppEnv>().get('/:regionId', (c) => {
  const regionId = c.req.param('regionId');
  if (!regionIdParamSchema.safeParse(regionId).success) {
    return c.json(buildGenericErrorBody(c.get('requestId')), 400);
  }

  const horizon = parseHorizon(c.req.query('horizon'));
  if (!horizon.ok) {
    return c.json(buildGenericErrorBody(c.get('requestId')), 400);
  }

  // Contract-shaped stub: every well-formed UUID 404s until the real read lands.
  return c.json(buildGenericErrorBody(c.get('requestId')), 404);
});
