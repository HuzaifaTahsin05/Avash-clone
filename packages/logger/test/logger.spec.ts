import { test, expect } from '@playwright/test';
import { logger, buildGenericErrorBody, handleError } from '../index';

function captureConsole(method: 'log' | 'warn' | 'error') {
  const original = console[method];
  const lines: string[] = [];
  console[method] = ((line: string) => {
    lines.push(line);
  }) as typeof console.log;
  return {
    lines,
    restore: () => {
      console[method] = original;
    },
  };
}

test.describe('logger — structured output', () => {
  test('logger.info writes a single-line JSON object with level/message/timestamp', () => {
    const capture = captureConsole('log');
    logger.info('hello');
    capture.restore();

    expect(capture.lines).toHaveLength(1);
    const parsed = JSON.parse(capture.lines[0] as string);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('hello');
    expect(typeof parsed.timestamp).toBe('string');
  });

  test('logger.error writes to console.error, not console.log', () => {
    const errorCapture = captureConsole('error');
    const logCapture = captureConsole('log');
    logger.error('boom');
    errorCapture.restore();
    logCapture.restore();

    expect(errorCapture.lines).toHaveLength(1);
    expect(logCapture.lines).toHaveLength(0);
  });
});

test.describe('logger — PII/secret redaction (§1)', () => {
  test('redacts a top-level key matching the sensitive pattern', () => {
    const capture = captureConsole('log');
    logger.info('user event', { email: 'someone@example.com', userId: '123' });
    capture.restore();

    const parsed = JSON.parse(capture.lines[0] as string);
    expect(parsed.email).toBe('[REDACTED]');
    expect(parsed.userId).toBe('123');
  });

  test('redacts a sensitive key nested at depth', () => {
    const capture = captureConsole('log');
    logger.info('nested event', {
      request: { headers: { authorization: 'Bearer real-token-value' } },
    });
    capture.restore();

    const parsed = JSON.parse(capture.lines[0] as string);
    expect(parsed.request.headers.authorization).toBe('[REDACTED]');
  });

  test('redacts every key name in the sensitive set', () => {
    const capture = captureConsole('log');
    logger.info('kitchen sink', {
      email: 'x',
      phone: 'x',
      password: 'x',
      token: 'x',
      secret: 'x',
      jwt: 'x',
      authorization: 'x',
      cookie: 'x',
      service_role: 'x',
      api_key: 'x',
      ssn: 'x',
      address: 'x',
      safe: 'x',
    });
    capture.restore();

    const parsed = JSON.parse(capture.lines[0] as string);
    for (const key of [
      'email',
      'phone',
      'password',
      'token',
      'secret',
      'jwt',
      'authorization',
      'cookie',
      'service_role',
      'api_key',
      'ssn',
      'address',
    ]) {
      expect(parsed[key]).toBe('[REDACTED]');
    }
    expect(parsed.safe).toBe('x');
  });
});

test.describe('buildGenericErrorBody (R10)', () => {
  test('returns only a fixed message and the given requestId', () => {
    const body = buildGenericErrorBody('req-123');
    expect(body).toEqual({
      error: {
        message: 'Something went wrong. Please try again.',
        requestId: 'req-123',
      },
    });
  });
});

test.describe('handleError (R10)', () => {
  test('logs the full error server-side but returns only the generic body', () => {
    const capture = captureConsole('error');
    const thrown = new Error('internal detail that must never leak');
    const body = handleError(thrown, 'req-456');
    capture.restore();

    // Server-side log retains full detail.
    expect(capture.lines).toHaveLength(1);
    const logged = JSON.parse(capture.lines[0] as string);
    expect(logged.message).toBe('internal detail that must never leak');
    expect(typeof logged.stack).toBe('string');

    // Returned body never leaks it.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('internal detail');
    expect(serialized).not.toContain('stack');
    expect(body.error.requestId).toBe('req-456');
  });
});
