import { describe, test, expect } from 'vitest';
import { consumeGeminiQuota, GEMINI_DAILY_QUOTA_GUARD, GEMINI_QUOTA_KEY, type QuotaGuardRedisLike } from '../quotaGuard';

function createFakeRedis(startingCount = 0): QuotaGuardRedisLike & { expireCalls: unknown[][] } {
  let count = startingCount;
  const expireCalls: unknown[][] = [];
  return {
    async incr() {
      count += 1;
      return count;
    },
    async expire(...args) {
      expireCalls.push(args);
      return 1;
    },
    expireCalls,
  };
}

function unreachableRedis(): QuotaGuardRedisLike {
  return {
    incr: () => Promise.reject(new Error('ECONNREFUSED')),
    expire: () => Promise.reject(new Error('ECONNREFUSED')),
  };
}

describe('consumeGeminiQuota — boundary', () => {
  test('allows exactly at the ceiling and denies one past it', async () => {
    const redis = createFakeRedis(GEMINI_DAILY_QUOTA_GUARD - 1);
    const atCeiling = await consumeGeminiQuota(redis);
    const overCeiling = await consumeGeminiQuota(redis);

    expect(atCeiling.ok && atCeiling.allowed).toBe(true);
    expect(atCeiling.ok && atCeiling.remaining).toBe(0);
    expect(overCeiling.ok && overCeiling.allowed).toBe(false);
  });

  test('sets a 24h expiry only on the request that creates the key', async () => {
    const redis = createFakeRedis(0);
    await consumeGeminiQuota(redis);
    await consumeGeminiQuota(redis);

    expect(redis.expireCalls).toHaveLength(1);
    expect(redis.expireCalls[0][0]).toBe(GEMINI_QUOTA_KEY);
  });
});

describe('consumeGeminiQuota — Redis unreachable', () => {
  test('is distinguishable from quota exhausted', async () => {
    const redis = unreachableRedis();
    const result = await consumeGeminiQuota(redis);
    expect(result).toEqual({ ok: false, reason: 'redis_unreachable' });
  });
});
