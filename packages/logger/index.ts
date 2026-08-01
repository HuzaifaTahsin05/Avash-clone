type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogMeta = Record<string, unknown>;

const REDACTED = '[REDACTED]';

/**
 * Key names that must never appear in cleartext in a log line (§1 PII rule).
 * Matched case-insensitively against object keys at any depth.
 */
const SENSITIVE_KEY_PATTERN =
  /email|phone|password|token|secret|jwt|authorization|cookie|service_role|api_key|ssn|address/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(val, depth + 1);
  }
  return result;
}

function write(level: LogLevel, message: string, meta?: LogMeta): void {
  const line = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...((redact(meta) as LogMeta) ?? {}),
  });
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, meta?: LogMeta) => write('debug', message, meta),
  info: (message: string, meta?: LogMeta) => write('info', message, meta),
  warn: (message: string, meta?: LogMeta) => write('warn', message, meta),
  error: (message: string, meta?: LogMeta) => write('error', message, meta),
};

export interface GenericErrorBody {
  error: {
    message: string;
    requestId: string;
  };
}

/**
 * Builds the generic, user-safe error body (R10). Never includes a stack
 * trace, internal message, or dependency detail — only a correlation ID
 * the user can quote when reporting an issue.
 */
export function buildGenericErrorBody(requestId: string): GenericErrorBody {
  return {
    error: {
      message: 'Something went wrong. Please try again.',
      requestId,
    },
  };
}

/**
 * Logs the full error server-side (with stack + correlation ID) and returns
 * the generic body to send back to the client. Used both by per-route
 * try/catch wrapping and by Hono's top-level `onError` backstop.
 */
export function handleError(error: unknown, requestId: string): GenericErrorBody {
  logger.error('Unhandled request error', {
    requestId,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return buildGenericErrorBody(requestId);
}

type Handler<C> = (c: C) => Promise<Response> | Response;

interface ErrorBoundaryContext {
  get: (key: 'requestId') => string;
  json: (body: unknown, status: number) => Response;
}

/**
 * Wraps a Hono route handler so a thrown error never escapes as a raw
 * 500 with internal detail. Requires the request-id middleware to have
 * already stored a correlation ID in context via `c.set('requestId', id)`.
 */
export function withErrorBoundary<C extends ErrorBoundaryContext>(handler: Handler<C>): Handler<C> {
  return async (c: C) => {
    try {
      return await handler(c);
    } catch (error) {
      const requestId = c.get('requestId');
      return c.json(handleError(error, requestId), 500);
    }
  };
}
