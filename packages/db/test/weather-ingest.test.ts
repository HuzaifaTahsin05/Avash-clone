import { describe, expect, it, vi } from 'vitest';
// scripts/jobs/lib/** is owned by the weather-ingest job (scripts/jobs/weather-ingest.ts).
// These are plain in-process function calls (docs/standards/testing.md
// "packages/*" profile) — no server, no DOM — but the root vitest.config.ts
// projects list has no entry for scripts/**/*.test.ts, and only this
// package's `packages/*/test/**/*.test.ts` glob picks the file up without
// editing that shared, single-writer config. A root config change to add a
// `scripts` project (so these can live at scripts/jobs/weather-ingest.test.ts
// instead) is recommended as a follow-up.
import { backoffDelayMs, isRetryableStatus } from '../../../scripts/jobs/lib/backoff.ts';
import { fetchWeatherWithRetry } from '../../../scripts/jobs/lib/fetchWithRetry.ts';
import { hourBucketEnd, hourBucketStart } from '../../../scripts/jobs/lib/hourBucket.ts';
import { mapObservation } from '../../../scripts/jobs/lib/mapObservation.ts';

const FULL_PAYLOAD = {
  main: { temp: 29.4, temp_min: 26.1, temp_max: 32.8, humidity: 84 },
  rain: { '1h': 2.3 },
  dt: 1_700_000_000,
};

const NO_RAIN_PAYLOAD = {
  main: { temp: 30.1, temp_min: 27.0, temp_max: 33.5, humidity: 70 },
  // rain key entirely absent — the real-world "not raining" shape.
  dt: 1_700_003_600,
};

const NO_MAIN_PAYLOAD = {
  rain: { '1h': 0.5 },
  dt: 1_700_007_200,
};

describe('mapObservation', () => {
  it('maps a full payload to a row with every field populated', () => {
    const row = mapObservation('region-1', FULL_PAYLOAD);
    expect(row).toEqual({
      region_id: 'region-1',
      observed_at: new Date(1_700_000_000 * 1000).toISOString(),
      temp_mean_c: 29.4,
      temp_min_c: 26.1,
      temp_max_c: 32.8,
      humidity_pct: 84,
      precipitation_mm: 2.3,
      source: 'openweathermap',
      raw_payload: FULL_PAYLOAD,
    });
  });

  it('defaults precipitation_mm to 0, never null/undefined, when rain is absent', () => {
    const row = mapObservation('region-1', NO_RAIN_PAYLOAD);
    expect(row.precipitation_mm).toBe(0);
    expect(row.temp_mean_c).toBe(30.1);
  });

  it('maps every field to null (never undefined/NaN) when main is missing entirely', () => {
    const row = mapObservation('region-1', NO_MAIN_PAYLOAD);
    expect(row.temp_mean_c).toBeNull();
    expect(row.temp_min_c).toBeNull();
    expect(row.temp_max_c).toBeNull();
    expect(row.humidity_pct).toBeNull();
    expect(row.precipitation_mm).toBe(0.5);
    expect(Number.isNaN(row.temp_mean_c)).toBe(false);
  });

  it('never throws on a malformed / non-object payload', () => {
    for (const bad of [null, undefined, 'not json', 42, [], {}]) {
      expect(() => mapObservation('region-1', bad)).not.toThrow();
      const row = mapObservation('region-1', bad);
      expect(row.temp_mean_c).toBeNull();
      expect(row.precipitation_mm).toBe(0);
      expect(row.source).toBe('openweathermap');
    }
  });

  it('falls back to the injected clock when dt is missing/invalid', () => {
    const fixedNow = new Date('2026-01-01T00:00:00.000Z');
    const row = mapObservation('region-1', {}, () => fixedNow);
    expect(row.observed_at).toBe(fixedNow.toISOString());
  });
});

describe('hourBucket', () => {
  it('floors to the start of the UTC hour', () => {
    expect(hourBucketStart('2026-03-01T14:37:52.000Z')).toBe('2026-03-01T14:00:00.000Z');
  });

  it('bucket end is exactly one hour after bucket start', () => {
    const start = hourBucketStart('2026-03-01T14:37:52.000Z');
    expect(hourBucketEnd(start)).toBe('2026-03-01T15:00:00.000Z');
  });
});

describe('backoff', () => {
  it('doubles the delay each attempt', () => {
    expect(backoffDelayMs(1, 500)).toBe(500);
    expect(backoffDelayMs(2, 500)).toBe(1000);
    expect(backoffDelayMs(3, 500)).toBe(2000);
  });

  it('classifies 429 and 5xx as retryable, other 4xx as not', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function malformedResponse(status = 200): Response {
  return new Response('<html>not json</html>', { status });
}

describe('fetchWeatherWithRetry', () => {
  it('succeeds immediately on a 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(FULL_PAYLOAD));
    const outcome = await fetchWeatherWithRetry(fetchImpl as unknown as typeof fetch, 'https://example.test', {
      maxAttempts: 3,
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    expect(outcome).toEqual({ status: 'success', payload: FULL_PAYLOAD });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries once on 429 then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(jsonResponse(FULL_PAYLOAD));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const outcome = await fetchWeatherWithRetry(fetchImpl as unknown as typeof fetch, 'https://example.test', {
      maxAttempts: 3,
      sleep,
    });
    expect(outcome).toEqual({ status: 'success', payload: FULL_PAYLOAD });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('fails after exhausting retries on three consecutive 429s', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const outcome = await fetchWeatherWithRetry(fetchImpl as unknown as typeof fetch, 'https://example.test', {
      maxAttempts: 3,
      sleep,
    });
    expect(outcome).toEqual({ status: 'failed', reason: 'upstream status 429' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('skips without retrying on a non-429 4xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const outcome = await fetchWeatherWithRetry(fetchImpl as unknown as typeof fetch, 'https://example.test', {
      maxAttempts: 3,
      sleep,
    });
    expect(outcome).toEqual({ status: 'skipped', reason: 'upstream status 401' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('reports a malformed (non-JSON) 200 body as failed, not retried', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(malformedResponse(200));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const outcome = await fetchWeatherWithRetry(fetchImpl as unknown as typeof fetch, 'https://example.test', {
      maxAttempts: 3,
      sleep,
    });
    expect(outcome.status).toBe('failed');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
