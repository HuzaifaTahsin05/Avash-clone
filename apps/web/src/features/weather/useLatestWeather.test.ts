import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/env', () => ({ env: { apiBaseUrl: 'https://api.example.test' } }));

function mockFetchOnce(response: Partial<Response> | null, shouldReject = false) {
  global.fetch = vi.fn().mockImplementation(() => {
    if (shouldReject) return Promise.reject(new Error('network down'));
    return Promise.resolve(response as Response);
  });
}

const validObservation = {
  regionId: '123e4567-e89b-42d3-a456-426614174000',
  regionCode: 'DHK',
  regionName: 'Dhaka',
  observedAt: '2026-08-14T00:00:00.000Z',
  tempMeanC: 29.5,
  tempMinC: 25.1,
  tempMaxC: 33.2,
  humidityPct: 78,
  precipitationMm: 4.2,
  source: 'openweathermap',
};

describe('fetchLatestWeather', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('resolves with parsed observations on a schema-matching 200', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({
        observations: [validObservation],
        generatedAt: '2026-08-14T00:05:00.000Z',
        requestId: 'req-1',
      }),
    });
    const { fetchLatestWeather } = await import('./useLatestWeather');
    const data = await fetchLatestWeather();
    expect(data.observations).toHaveLength(1);
    expect(data.observations[0]?.regionCode).toBe('DHK');
  });

  test('rejects with a generic error on a transport failure', async () => {
    mockFetchOnce(null, true);
    const { fetchLatestWeather } = await import('./useLatestWeather');
    await expect(fetchLatestWeather()).rejects.toThrow('Unable to reach the server');
  });

  test('rejects when the payload does not match the schema', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({ observations: [{ regionCode: 'DHK' }] }),
    });
    const { fetchLatestWeather } = await import('./useLatestWeather');
    await expect(fetchLatestWeather()).rejects.toThrow('Response did not match the expected shape');
  });
});
