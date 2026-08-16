import { Hono } from 'hono';
import {
  aiValidationSchema,
  breedingReportRequestSchema,
  breedingReportResponseSchema,
  breedingReportVerifyRequestSchema,
  type AiValidation,
} from '@avash/types';
import { buildGenericErrorBody, logger } from '@avash/logger';
import { BREEDING_REPORT_RATE_LIMIT, REPORT_VERIFY_RATE_LIMIT, isModerator, type RateLimitRedisLike } from '@avash/security';
import { auth } from '../middleware/auth';
import { turnstile } from '../middleware/turnstile';
import { rateLimit } from '../middleware/rate-limit';
import { createSupabaseAdmin } from '../lib/supabaseAdmin';
import { jwtVerify } from '../lib/jwtVerify';
import { validateReportDescription } from '../lib/reportValidation';
import type { AppEnv, Bindings } from '../types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `SPAM_LIKELIHOOD_REJECT_THRESHOLD` (§14, docs/constants-registry.md) —
 * above this a report is flagged for moderator review, never rejected
 * outright (a spam-flagged or Gemini-unreachable report is still stored
 * with `status: 'pending'`; only the flag differs).
 */
const SPAM_LIKELIHOOD_REJECT_THRESHOLD = 0.7;

/** Fallback `ai_validation` payload when Gemini is unavailable/quota-exhausted — always flags for manual review. */
const AI_VALIDATION_UNAVAILABLE: AiValidation = {
  isPlausible: true,
  category: 'other',
  spamLikelihood: 1,
};

function extractBearerToken(header: string | undefined): string | null {
  const [scheme, token] = header?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : null;
}

/**
 * Best-effort reporter attribution for the anonymous-by-design create
 * route (ADR-005 — `auth` middleware is deliberately absent here). A
 * missing/invalid/expired token must never 401 this route; it only ever
 * degrades to an anonymous (`null`) report.
 */
async function extractOptionalReporterId(authHeader: string | undefined, jwtSecret: string): Promise<string | null> {
  const token = extractBearerToken(authHeader);
  if (!token) {
    return null;
  }
  const result = await jwtVerify(token, jwtSecret);
  if (!result.ok) {
    return null;
  }
  const sub = result.claims?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

function isFlagged(aiValidation: AiValidation | null | undefined): boolean {
  return (aiValidation?.spamLikelihood ?? 0) > SPAM_LIKELIHOOD_REJECT_THRESHOLD;
}

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

        const reporterId = await extractOptionalReporterId(c.req.header('Authorization'), c.env.SUPABASE_JWT_SECRET);

        let aiValidation: AiValidation = { isPlausible: true, category: 'other', spamLikelihood: 0 };
        const description = parsed.data.description;
        if (description) {
          const result = await validateReportDescription({ apiKey: c.env.GEMINI_API_KEY, description });
          if (result.ok) {
            aiValidation = result.data;
          } else {
            logger.error('reports/breeding-site: Gemini validation unavailable, flagging for manual review', {
              requestId,
              reason: result.reason,
            });
            aiValidation = AI_VALIDATION_UNAVAILABLE;
          }
        }

        try {
          const supabase = createSupabaseAdmin(c.env);
          const { data, error } = await supabase
            .from('breeding_reports')
            .insert({
              reporter_id: reporterId,
              geom: { type: 'Point', coordinates: [parsed.data.lng, parsed.data.lat] },
              description: description ?? null,
              photo_url: parsed.data.photoUrl ?? null,
              ai_validation: aiValidationSchema.parse(aiValidation),
            })
            .select('id, status')
            .single();

          if (error || !data) {
            logger.error('reports/breeding-site: Supabase insert failed', { requestId });
            return c.json(buildGenericErrorBody(requestId), 503);
          }

          const responseBody = breedingReportResponseSchema.parse({
            id: data.id,
            status: data.status,
            flaggedForReview: isFlagged(aiValidation),
            requestId,
          });
          return c.json(responseBody, 201);
        } catch (thrown) {
          logger.error('reports/breeding-site: unexpected failure', {
            requestId,
            message: thrown instanceof Error ? thrown.message : String(thrown),
          });
          return c.json(buildGenericErrorBody(requestId), 503);
        }
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

        // Defense in depth (intentional, not dead code) — the `auth({ role:
        // 'moderator' })` middleware above already gates this, but the
        // handler re-checks so a future middleware refactor can't silently
        // reopen this route.
        const user = c.get('user');
        if (!user || !isModerator(user.role)) {
          return c.json(buildGenericErrorBody(requestId), 403);
        }

        const id = c.req.param('id');
        if (!UUID_PATTERN.test(id)) {
          return c.json(buildGenericErrorBody(requestId), 400);
        }
        const body = await c.req.json().catch(() => undefined);
        const parsed = breedingReportVerifyRequestSchema.safeParse(body);
        if (!parsed.success) {
          return c.json(buildGenericErrorBody(requestId), 400);
        }

        try {
          const supabase = createSupabaseAdmin(c.env);
          const { data, error } = await supabase
            .from('breeding_reports')
            .update({
              status: parsed.data.status,
              verified_by: user.id,
              ...(parsed.data.municipalRefId !== undefined ? { municipal_ref_id: parsed.data.municipalRefId } : {}),
            })
            .eq('id', id)
            .select('id, status, ai_validation')
            .maybeSingle();

          if (error) {
            logger.error('reports/breeding-site/verify: Supabase update failed', { requestId });
            return c.json(buildGenericErrorBody(requestId), 503);
          }
          if (!data) {
            return c.json(buildGenericErrorBody(requestId), 404);
          }

          const responseBody = breedingReportResponseSchema.parse({
            id: data.id,
            status: data.status,
            flaggedForReview: isFlagged(data.ai_validation as AiValidation | null),
            requestId,
          });
          return c.json(responseBody, 200);
        } catch (thrown) {
          logger.error('reports/breeding-site/verify: unexpected failure', {
            requestId,
            message: thrown instanceof Error ? thrown.message : String(thrown),
          });
          return c.json(buildGenericErrorBody(requestId), 503);
        }
      }
    );
}

export const reports = createReports();
