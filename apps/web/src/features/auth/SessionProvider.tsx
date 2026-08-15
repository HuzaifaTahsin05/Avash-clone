import { createContext, useContext, type ReactNode } from 'react';
import type { AppRole } from '@avash/security';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

export interface SessionContextValue {
  /** Opaque — callers destructure via useSession(), never this context directly. */
  session: unknown | null;
  user: { id: string; email: string | null } | null;
  role: AppRole | null;
  accessToken: string | null;
  status: SessionStatus;
}

/**
 * Frozen shape (Phase 0) so router.tsx and Header.tsx can be written
 * against it now. This provider is a pass-through stub — it always
 * reports `anonymous` and never touches Supabase. The real
 * getSession()/onAuthStateChange() wiring ships with the authentication
 * feature; only the body of this file changes then, not its exported
 * shape.
 */
const SessionContext = createContext<SessionContextValue>({
  session: null,
  user: null,
  role: null,
  accessToken: null,
  status: 'anonymous',
});

export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <SessionContext.Provider
      value={{ session: null, user: null, role: null, accessToken: null, status: 'anonymous' }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
