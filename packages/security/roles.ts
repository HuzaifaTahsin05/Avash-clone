/**
 * Where a custom role lives in a Supabase JWT (decision A). `app_metadata`
 * is set server-side only — a user cannot self-assign it via `user_metadata`,
 * which the client can write.
 */
export const APP_ROLE_CLAIM_PATH = 'app_metadata.role';

export type AppRole = 'moderator' | 'admin';

const APP_ROLES: readonly AppRole[] = ['moderator', 'admin'];

function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value);
}

/**
 * Reads the custom role out of a decoded JWT's claims. Every access is
 * optional-chained (R7) — `claims` comes from a token the caller does not
 * fully control, and a malformed or absent app_metadata must resolve to
 * "no role", never throw.
 */
export function readAppRole(claims: unknown): AppRole | null {
  if (typeof claims !== 'object' || claims === null) {
    return null;
  }
  const appMetadata = (claims as Record<string, unknown>)?.app_metadata;
  if (typeof appMetadata !== 'object' || appMetadata === null) {
    return null;
  }
  const role = (appMetadata as Record<string, unknown>)?.role;
  return isAppRole(role) ? role : null;
}

export function isModerator(role: AppRole | null | undefined): boolean {
  return role === 'moderator' || role === 'admin';
}
