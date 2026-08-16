import type { MiddlewareHandler } from 'hono';
import { buildGenericErrorBody } from '@avash/logger';
import { readAppRole, type AppRole } from '@avash/security';
import { jwtVerify } from '../lib/jwtVerify';
import type { AppEnv, AuthenticatedUser } from '../types';

export interface AuthOptions {
  /** When set, a valid token without this role (or a higher one) 403s instead of proceeding. */
  role?: AppRole;
}

function extractBearerToken(header: string | undefined): string | null {
  const [scheme, token] = header?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : null;
}

/**
 * Verifies the caller's Supabase session and, optionally, an app_metadata
 * role (decision A). 401s a missing/invalid/expired token; 403s a valid
 * token whose role doesn't satisfy `options.role`. Both use the generic
 * error body — the distinction is the status code only, never a message
 * string (R10).
 */
export const auth =
  (options?: AuthOptions): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const requestId = c.get('requestId');
    const token = extractBearerToken(c.req.header('Authorization'));

    if (!token) {
      return c.json(buildGenericErrorBody(requestId), 401);
    }

    const result = await jwtVerify(token, c.env.SUPABASE_JWT_SECRET);
    if (!result.ok) {
      return c.json(buildGenericErrorBody(requestId), 401);
    }

    const role = readAppRole(result.claims);
    const user: AuthenticatedUser = {
      id: String(result.claims?.sub ?? ''),
      email: typeof result.claims?.email === 'string' ? result.claims.email : null,
      role,
    };

    if (options?.role && role !== options.role && !(options.role === 'moderator' && role === 'admin')) {
      return c.json(buildGenericErrorBody(requestId), 403);
    }

    c.set('user', user);
    await next();
  };
