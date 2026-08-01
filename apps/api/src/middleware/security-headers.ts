import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

/**
 * Applies the §7.4 transport/header hardening set to every response.
 * No `Access-Control-Allow-Credentials` here — CORS is handled separately.
 */
export const securityHeaders = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  await next();
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'geolocation=(self), notifications=(self)');
};
