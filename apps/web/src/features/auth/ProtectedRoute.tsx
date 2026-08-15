import type { ReactNode } from 'react';
import type { AppRole } from '@avash/security';

export interface ProtectedRouteProps {
  children: ReactNode;
  role?: AppRole;
}

/**
 * Frozen props (Phase 0) so router.tsx can wrap /moderation now. This is
 * a pass-through stub — decision C already establishes that client-side
 * protection is UX only, so a stub here blocks nothing a real Worker
 * middleware + RLS check doesn't also gate. The real
 * loading/redirect-to-login/no-access behavior ships with the
 * authentication feature; only this file's body changes then.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  return <>{children}</>;
}
