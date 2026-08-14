import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/env', () => ({ env: { apiBaseUrl: 'https://api.example.test' } }));

function mockFetchOnce(response: Partial<Response> | null, shouldReject = false) {
  global.fetch = vi.fn().mockImplementation(() => {
    if (shouldReject) return Promise.reject(new Error('network down'));
    return Promise.resolve(response as Response);
  });
}

const regionId = '123e4567-e89b-42d3-a456-426614174000';

describe('fetchRegionRisk', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('resolves with the parsed detail payload on a schema-matching 200', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({
        regionId,
        regionCode: 'DHK',
        regionName: 'Dhaka',
        predictions: [],
        latestWeather: null,
        requestId: 'req-1',
      }),
    });
    const { fetchRegionRisk } = await import('./useRegionRisk');
    const data = await fetchRegionRisk(regionId, 2);
    expect(data.regionId).toBe(regionId);
    expect(data.latestWeather).toBeNull();
  });

  test('rejects with a generic error on a transport failure', async () => {
    mockFetchOnce(null, true);
    const { fetchRegionRisk } = await import('./useRegionRisk');
    await expect(fetchRegionRisk(regionId, 2)).rejects.toThrow('Unable to reach the server');
  });

  test('rejects when the payload does not match the schema', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({ regionId: 'not-a-uuid' }),
    });
    const { fetchRegionRisk } = await import('./useRegionRisk');
    await expect(fetchRegionRisk(regionId, 2)).rejects.toThrow(
      'Response did not match the expected shape',
    );
  });
});
