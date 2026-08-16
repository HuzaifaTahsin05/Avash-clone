import { createContext, useContext } from 'react';
import type { AppRole } from '@avash/security';
import type { Session } from '@supabase/supabase-js';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

export interface SessionContextValue {
  /** Opaque — callers destructure via useSession(), never this context directly. */
  session: Session | null;
  user: { id: string; email: string | null } | null;
  role: AppRole | null;
  accessToken: string | null;
  status: SessionStatus;
}

/**
 * `loading` until `SessionProvider`'s initial `getSession()` resolves —
 * this is what stops `ProtectedRoute` from flashing a redirect before the
 * session is known.
 */
export const initialSessionValue: SessionContextValue = {
  session: null,
  user: null,
  role: null,
  accessToken: null,
  status: 'loading',
};

export const SessionContext = createContext<SessionContextValue>(initialSessionValue);

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
