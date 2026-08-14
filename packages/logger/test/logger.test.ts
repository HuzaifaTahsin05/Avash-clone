import { test, expect, describe } from 'vitest';
import { logger, buildGenericErrorBody, handleError, withErrorBoundary } from '../index';

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

describe('logger — structured output', () => {
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

describe('logger — PII/secret redaction (§1)', () => {
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

describe('buildGenericErrorBody (R10)', () => {
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

describe('handleError (R10)', () => {
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

describe('logger.debug / logger.warn', () => {
  test('logger.debug writes to console.log at level "debug"', () => {
    const capture = captureConsole('log');
    logger.debug('debugging');
    capture.restore();

    const parsed = JSON.parse(capture.lines[0] as string);
    expect(parsed.level).toBe('debug');
  });

  test('logger.warn writes to console.warn at level "warn"', () => {
    const capture = captureConsole('warn');
    logger.warn('careful');
    capture.restore();

    const parsed = JSON.parse(capture.lines[0] as string);
    expect(parsed.level).toBe('warn');
  });
});

describe('redact — depth ceiling', () => {
  test('stops descending past depth 5, leaving deeper values as-is', () => {
    const capture = captureConsole('log');
    // 7 levels deep — past the depth>5 cutoff — carrying a sensitive key
    // name that would be redacted if the walk still reached it.
    logger.info('deep object', {
      l1: { l2: { l3: { l4: { l5: { l6: { password: 'still-here' } } } } } },
    });
    capture.restore();

    const parsed = JSON.parse(capture.lines[0] as string);
    expect(parsed.l1.l2.l3.l4.l5.l6.password).toBe('still-here');
  });
});

describe('withErrorBoundary', () => {
  function makeContext(requestId: string) {
    const calls: Array<{ body: unknown; status: number }> = [];
    return {
      calls,
      ctx: {
        get: () => requestId,
        json: (body: unknown, status: number) => {
          calls.push({ body, status });
          return { body, status } as unknown as Response;
        },
      },
    };
  }

  test('passes through a successful handler untouched', async () => {
    const { ctx } = makeContext('req-1');
    const handler = withErrorBoundary(async () => new Response('ok') as never);
    const result = await handler(ctx);
    expect(result).toBeInstanceOf(Response);
  });

  test('catches a thrown error and returns the generic 500 body', async () => {
    const capture = captureConsole('error');
    const { ctx, calls } = makeContext('req-2');
    const handler = withErrorBoundary(() => {
      throw new Error('boom inside handler');
    });
    await handler(ctx);
    capture.restore();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.status).toBe(500);
    const body = calls[0]?.body as { error: { requestId: string } };
    expect(body.error.requestId).toBe('req-2');
    expect(JSON.stringify(body)).not.toContain('boom inside handler');
  });
});
