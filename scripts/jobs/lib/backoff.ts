/**
 * Pure backoff/retry-classification helpers for weather-ingest.ts
 * (docs/constants-registry.md WEATHER_INGEST_MAX_RETRIES).
 */

/** Exponential backoff in ms: attempt 1 -> baseMs, attempt 2 -> 2*baseMs, ... */
export function backoffDelayMs(attempt: number, baseMs = 500): number {
  const safeAttempt = Math.max(1, attempt);
  return baseMs * 2 ** (safeAttempt - 1);
}

/** 429 (rate limited) and any 5xx are worth retrying; other 4xx are not. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}
