/**
 * Global daily circuit breaker on Gemini calls (§7.3 free-tier cost
 * control). One shared counter, reset by TTL rather than a cron job — the
 * first call of a new UTC day creates the key with a 24h expiry, every
 * later call that day just increments it.
 */

export interface QuotaGuardRedisLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number, condition?: 'NX'): Promise<unknown>;
}

export const GEMINI_DAILY_QUOTA_GUARD = 1500;
export const GEMINI_QUOTA_KEY = 'quota:gemini:daily';
const SECONDS_PER_DAY = 86400;

export type QuotaResult =
  | { ok: true; allowed: boolean; remaining: number }
  | { ok: false; reason: 'redis_unreachable' };

export async function consumeGeminiQuota(redis: QuotaGuardRedisLike): Promise<QuotaResult> {
  try {
    const count = await redis.incr(GEMINI_QUOTA_KEY);
    // Only the request that just created the key (count === 1) sets the
    // expiry — NX means a race between two "first" requests still leaves
    // exactly one 24h TTL on the key, never a runaway extension.
    if (count === 1) {
      await redis.expire(GEMINI_QUOTA_KEY, SECONDS_PER_DAY, 'NX');
    }

    return {
      ok: true,
      allowed: count <= GEMINI_DAILY_QUOTA_GUARD,
      remaining: Math.max(0, GEMINI_DAILY_QUOTA_GUARD - count),
    };
  } catch {
    return { ok: false, reason: 'redis_unreachable' };
  }
}
