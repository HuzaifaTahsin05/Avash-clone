import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/env', () => ({ env: { apiBaseUrl: 'https://api.example.test' } }));

function mockFetchOnce(response: Partial<Response> | null, shouldReject = false) {
  global.fetch = vi.fn().mockImplementation(() => {
    if (shouldReject) return Promise.reject(new Error('network down'));
    return Promise.resolve(response as Response);
  });
}

describe('fetchRiskMap', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('resolves with the parsed FeatureCollection on a schema-matching 200', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'FeatureCollection',
        features: [],
        horizonWeeks: 2,
        generatedAt: null,
        requestId: 'req-1',
      }),
    });
    const { fetchRiskMap } = await import('./useRiskMap');
    const data = await fetchRiskMap(2);
    expect(data.type).toBe('FeatureCollection');
    expect(data.horizonWeeks).toBe(2);
  });

  test('rejects with a generic error on a transport failure', async () => {
    mockFetchOnce(null, true);
    const { fetchRiskMap } = await import('./useRiskMap');
    await expect(fetchRiskMap(4)).rejects.toThrow('Unable to reach the server');
  });

  test('rejects when the payload does not match the schema', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({ type: 'NotAFeatureCollection' }),
    });
    const { fetchRiskMap } = await import('./useRiskMap');
    await expect(fetchRiskMap(2)).rejects.toThrow('Response did not match the expected shape');
  });
});
