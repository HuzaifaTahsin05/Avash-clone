import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isModerator, type AppRole } from '@avash/security';
import { useSession } from './useSession';

export interface ProtectedRouteProps {
  children: ReactNode;
  role?: AppRole;
}

/**
 * Client-side gate is UX only — the real gate is the Worker's `auth`
 * middleware plus RLS (docs/features/authentication.md). This component's
 * job is just to avoid flashing a page a user cannot use.
 */
function hasRequiredRole(required: AppRole | undefined, actual: AppRole | null): boolean {
  if (!required) return true;
  if (required === 'moderator') return isModerator(actual);
  return actual === required;
}

export function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { status, role: userRole } = useSession();
  const location = useLocation();

  // Renders nothing (not a redirect) while the session is still resolving
  // — this is what prevents a protected page from flashing data or a
  // redirect before the initial getSession() settles.
  if (status === 'loading') {
    return null;
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location?.pathname ?? '/' }} />;
  }

  if (!hasRequiredRole(role, userRole)) {
    return (
      <main className="page">
        <h1 className="page__title">Access restricted</h1>
        <p className="page__description">You do not have access to this page.</p>
      </main>
    );
  }

  return <>{children}</>;
}
