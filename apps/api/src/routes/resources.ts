import { Hono } from 'hono';
import { bloodSearchQuerySchema, bloodUpdateRequestSchema } from '@avash/types';
import { buildGenericErrorBody } from '@avash/logger';
import { parseBbox } from '@avash/geo';
import { BLOOD_UPDATE_RATE_LIMIT, type RateLimitRedisLike } from '@avash/security';
import { auth } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import type { AppEnv, Bindings } from '../types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateResourcesOptions {
  /** Test seam — route tests inject a fake in place of a real Upstash client. */
  redisFactory?: (env: Bindings) => RateLimitRedisLike;
}

/**
 * Contract-shaped stubs (Phase 0). Public GETs stay cors+headers only
 * (decision J — no rate-limit on this slice's reads); the write is
 * auth+rate-limit. Real bodies ship with the resource-ticker slice.
 */
export function createResources(options?: CreateResourcesOptions) {
  return new Hono<AppEnv>()
    .get('/hospitals', async (c) => {
      const requestId = c.get('requestId');
      const bbox = parseBbox(c.req.query('bbox'));
      if (!bbox.ok) {
        return c.json(buildGenericErrorBody(requestId), 400);
      }
      return c.json(buildGenericErrorBody(requestId), 501);
    })
    .get('/blood', async (c) => {
      const requestId = c.get('requestId');
      const parsed = bloodSearchQuerySchema.safeParse({
        bloodGroup: c.req.query('bloodGroup'),
        lat: Number(c.req.query('lat')),
        lng: Number(c.req.query('lng')),
        radiusM: c.req.query('radius') ? Number(c.req.query('radius')) : undefined,
      });
      if (!parsed.success) {
        return c.json(buildGenericErrorBody(requestId), 400);
      }
      return c.json(buildGenericErrorBody(requestId), 501);
    })
    .patch(
      '/blood/:id',
      auth(),
      rateLimit({
        guard: 'blood-update',
        window: 'minute',
        windowSeconds: 60,
        limit: BLOOD_UPDATE_RATE_LIMIT.perMinute,
        keyStrategy: 'user',
        redisFactory: options?.redisFactory,
      }),
      async (c) => {
        const requestId = c.get('requestId');
        const id = c.req.param('id');
        if (!UUID_PATTERN.test(id)) {
          return c.json(buildGenericErrorBody(requestId), 400);
        }
        const body = await c.req.json().catch(() => undefined);
        const parsed = bloodUpdateRequestSchema.safeParse(body);
        if (!parsed.success) {
          return c.json(buildGenericErrorBody(requestId), 400);
        }
        return c.json(buildGenericErrorBody(requestId), 501);
      }
    );
}

export const resources = createResources();
