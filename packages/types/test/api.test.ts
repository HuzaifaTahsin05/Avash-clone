import { describe, test, expect } from 'vitest';
import { healthResponseSchema, healthDbResponseSchema } from '../api';

describe('healthResponseSchema — round-trip', () => {
  const valid = {
    status: 'ok',
    version: '1.0.0',
    environment: 'development',
    timestamp: new Date().toISOString(),
    requestId: 'req-123',
  };

  test('accepts a well-formed payload', () => {
    expect(() => healthResponseSchema.parse(valid)).not.toThrow();
  });

  test('rejects a wrong-literal status', () => {
    expect(() => healthResponseSchema.parse({ ...valid, status: 'degraded' })).toThrow();
  });

  test('rejects a missing requestId', () => {
    const { requestId: _requestId, ...withoutRequestId } = valid;
    expect(() => healthResponseSchema.parse(withoutRequestId)).toThrow();
  });

  test('rejects a non-string version', () => {
    expect(() => healthResponseSchema.parse({ ...valid, version: 1 })).toThrow();
  });

  test('rejects a completely malformed payload rather than silently coercing it', () => {
    expect(() => healthResponseSchema.parse({ garbage: true })).toThrow();
    expect(() => healthResponseSchema.parse(null)).toThrow();
    expect(() => healthResponseSchema.parse('not an object')).toThrow();
  });
});

describe('healthDbResponseSchema — round-trip', () => {
  test('accepts a ready:true payload', () => {
    expect(() =>
      healthDbResponseSchema.parse({ ready: true, reason: null, requestId: 'req-1' })
    ).not.toThrow();
  });

  test('accepts a ready:false payload with a reason', () => {
    expect(() =>
      healthDbResponseSchema.parse({ ready: false, reason: 'database unreachable', requestId: 'req-2' })
    ).not.toThrow();
  });

  test('rejects a non-boolean ready field', () => {
    expect(() =>
      healthDbResponseSchema.parse({ ready: 'true', reason: null, requestId: 'req-3' })
    ).toThrow();
  });

  test('rejects a missing requestId', () => {
    expect(() => healthDbResponseSchema.parse({ ready: true, reason: null })).toThrow();
  });
});
