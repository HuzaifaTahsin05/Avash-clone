import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/env', () => ({ env: { apiBaseUrl: 'https://api.example.test' } }));

function mockFetchOnce(response: Partial<Response> | null, shouldReject = false) {
  global.fetch = vi.fn().mockImplementation(() => {
    if (shouldReject) return Promise.reject(new Error('network down'));
    return Promise.resolve(response as Response);
  });
}

describe('fetchWeatherHistory', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('resolves with parsed points on a schema-matching 200', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({
        regionCode: 'DHK',
        regionName: 'Dhaka',
        windowDays: 14,
        points: [
          { observedAt: '2026-08-01T00:00:00.000Z', tempMeanC: 28, humidityPct: 70, precipitationMm: 0 },
        ],
        generatedAt: '2026-08-14T00:00:00.000Z',
        requestId: 'req-1',
      }),
    });
    const { fetchWeatherHistory } = await import('./useWeatherHistory');
    const data = await fetchWeatherHistory('DHK', 14);
    expect(data.points).toHaveLength(1);
    expect(data.windowDays).toBe(14);
  });

  test('rejects with a generic error on a transport failure', async () => {
    mockFetchOnce(null, true);
    const { fetchWeatherHistory } = await import('./useWeatherHistory');
    await expect(fetchWeatherHistory('DHK', 14)).rejects.toThrow('Unable to reach the server');
  });

  test('rejects when the payload does not match the schema', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({ points: 'not-an-array' }),
    });
    const { fetchWeatherHistory } = await import('./useWeatherHistory');
    await expect(fetchWeatherHistory('DHK', 14)).rejects.toThrow(
      'Response did not match the expected shape',
    );
  });
});
