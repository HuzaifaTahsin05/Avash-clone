import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

vi.mock('./env', () => ({ env: { apiBaseUrl: 'https://api.example.test' } }));

const schema = z.object({ ok: z.literal(true) });

function mockFetchOnce(response: Partial<Response> | null, shouldReject = false) {
  global.fetch = vi.fn().mockImplementation(() => {
    if (shouldReject) return Promise.reject(new Error('network down'));
    return Promise.resolve(response as Response);
  });
}

describe('fetchApi (R2/R3/R4/R10)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('returns ok:true with parsed data on a schema-matching 200', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    const { fetchApi } = await import('./apiClient');
    const result = await fetchApi('/health', schema);
    expect(result).toEqual({ ok: true, data: { ok: true } });
  });

  test('returns ok:false, never throws, when the body does not match the schema', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: 'shape' }),
    });
    const { fetchApi } = await import('./apiClient');
    const result = await fetchApi('/health', schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Response did not match the expected shape');
    }
  });

  test('returns ok:false on a non-2xx response, without throwing', async () => {
    mockFetchOnce({ ok: false, status: 500, json: async () => ({}) });
    const { fetchApi } = await import('./apiClient');
    const result = await fetchApi('/health', schema);
    expect(result).toEqual({ ok: false, error: 'Request failed with status 500' });
  });

  test('returns a generic ok:false on a network failure, never the raw error', async () => {
    mockFetchOnce(null, true);
    const { fetchApi } = await import('./apiClient');
    const result = await fetchApi('/health', schema);
    expect(result).toEqual({ ok: false, error: 'Unable to reach the server' });
  });

  test('returns ok:false when the body is not valid JSON, rather than throwing', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    const { fetchApi } = await import('./apiClient');
    const result = await fetchApi('/health', schema);
    expect(result.ok).toBe(false);
  });

  test('a POST with a body sends it JSON-encoded and sets the method', async () => {
    let capturedInit: RequestInit | undefined;
    global.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedInit = init;
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response);
    });

    const { fetchApi } = await import('./apiClient');
    const result = await fetchApi('/reports', schema, { method: 'POST', body: { lat: 1, lng: 2 } });

    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(capturedInit?.method).toBe('POST');
    expect(capturedInit?.body).toBe(JSON.stringify({ lat: 1, lng: 2 }));
    expect((capturedInit?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  test('an accessToken is sent as a Bearer Authorization header', async () => {
    let capturedInit: RequestInit | undefined;
    global.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedInit = init;
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response);
    });

    const { fetchApi } = await import('./apiClient');
    await fetchApi('/reports', schema, { accessToken: 'test-token' });

    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  test('a 401 returns a distinct generic message, not the server body', async () => {
    mockFetchOnce({ ok: false, status: 401, json: async () => ({ error: { message: 'nope' } }) });
    const { fetchApi } = await import('./apiClient');
    const result = await fetchApi('/reports', schema);
    expect(result).toEqual({ ok: false, error: 'Sign-in required. Please sign in again.' });
  });

  test('a 403 returns the same distinct message as a 401', async () => {
    mockFetchOnce({ ok: false, status: 403, json: async () => ({}) });
    const { fetchApi } = await import('./apiClient');
    const result = await fetchApi('/reports', schema);
    expect(result).toEqual({ ok: false, error: 'Sign-in required. Please sign in again.' });
  });
});
