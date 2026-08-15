import { Hono } from 'hono';
import { breedingReportRequestSchema, breedingReportVerifyRequestSchema } from '@avash/types';
import { buildGenericErrorBody } from '@avash/logger';
import { BREEDING_REPORT_RATE_LIMIT, REPORT_VERIFY_RATE_LIMIT, type RateLimitRedisLike } from '@avash/security';
import { auth } from '../middleware/auth';
import { turnstile } from '../middleware/turnstile';
import { rateLimit } from '../middleware/rate-limit';
import type { AppEnv, Bindings } from '../types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateReportsOptions {
  /** Test seam — route tests inject a fake in place of a real Upstash client. */
  redisFactory?: (env: Bindings) => RateLimitRedisLike;
}

/**
 * Contract-shaped stubs (Phase 0). Middleware chains match §6: anonymous
 * reporting stays turnstile+rate-limit only (ADR-005 — auth is
 * deliberately absent here); verification is moderator-only. Real bodies
 * ship with the breeding-reports slice.
 */
export function createReports(options?: CreateReportsOptions) {
  return new Hono<AppEnv>()
    .post(
      '/breeding-site',
      turnstile(),
      rateLimit({
        guard: 'breeding-report',
        window: 'minute',
        windowSeconds: 60,
        limit: BREEDING_REPORT_RATE_LIMIT.perMinute,
        keyStrategy: 'ip',
        redisFactory: options?.redisFactory,
      }),
      rateLimit({
        guard: 'breeding-report',
        window: 'day',
        windowSeconds: 86400,
        limit: BREEDING_REPORT_RATE_LIMIT.perDay,
        keyStrategy: 'ip',
        redisFactory: options?.redisFactory,
      }),
      async (c) => {
        const requestId = c.get('requestId');
        const body = await c.req.json().catch(() => undefined);
        const parsed = breedingReportRequestSchema.safeParse(body);
        if (!parsed.success) {
          return c.json(buildGenericErrorBody(requestId), 400);
        }
        return c.json(buildGenericErrorBody(requestId), 501);
      }
    )
    .patch(
      '/breeding-site/:id/verify',
      auth({ role: 'moderator' }),
      rateLimit({
        guard: 'report-verify',
        window: 'minute',
        windowSeconds: 60,
        limit: REPORT_VERIFY_RATE_LIMIT.perMinute,
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
        const parsed = breedingReportVerifyRequestSchema.safeParse(body);
        if (!parsed.success) {
          return c.json(buildGenericErrorBody(requestId), 400);
        }
        return c.json(buildGenericErrorBody(requestId), 501);
      }
    );
}

export const reports = createReports();
