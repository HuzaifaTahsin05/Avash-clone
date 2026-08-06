import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

export const requestId = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const id = crypto.randomUUID();
  c.set('requestId', id);
  await next();
  c.header('X-Request-Id', id);
};
