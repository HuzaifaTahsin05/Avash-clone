import { backoffDelayMs, isRetryableStatus } from './backoff.ts';

/**
 * Fetch-with-retry for a single region's OpenWeatherMap call
 * (docs/constants-registry.md WEATHER_INGEST_MAX_RETRIES,
 * WEATHER_INGEST_REQUEST_SPACING_MS). Pure with respect to I/O: the actual
 * `fetch`, the sleep function, and the backoff schedule are all injected
 * so this is testable against fixtures without a network or a timer.
 *
 * - 429 / 5xx: retryable, exponential backoff, up to `maxAttempts` total
 *   tries (the first try counts as attempt 1).
 * - any other non-ok status (4xx): not retryable — the region is skipped,
 *   not retried and not counted as a failure.
 * - a response body that fails to parse as JSON is not retried (a 2xx
 *   with a malformed body will not fix itself on retry) — reported as a
 *   failure.
 * - a thrown network error is treated like a retryable transport failure.
 */

export type FetchOutcome =
  | { status: 'success'; payload: unknown }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

export interface FetchWithRetryOptions {
  maxAttempts: number;
  delayFn?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWeatherWithRetry(fetchImpl: typeof fetch, url: string, options: FetchWithRetryOptions): Promise<FetchOutcome> {
  const delayFn = options.delayFn ?? backoffDelayMs;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = Math.max(1, options.maxAttempts);

  let lastReason = 'unknown error';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchImpl(url);
      if (response.ok) {
        try {
          const payload: unknown = await response.json();
          return { status: 'success', payload };
        } catch {
          return { status: 'failed', reason: 'malformed response body (not JSON)' };
        }
      }
      if (!isRetryableStatus(response.status)) {
        return { status: 'skipped', reason: `upstream status ${response.status}` };
      }
      lastReason = `upstream status ${response.status}`;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : 'network error';
    }

    if (attempt < maxAttempts) {
      await sleep(delayFn(attempt));
    }
  }

  return { status: 'failed', reason: lastReason };
}
