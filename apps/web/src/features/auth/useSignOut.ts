import { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/** Fixed, generic message only — never `error.message` from Supabase. */
export const SIGN_OUT_GENERIC_ERROR = 'Unable to sign out. Please try again.';

export interface UseSignOutResult {
  error: string | null;
  signOut: () => Promise<{ ok: boolean }>;
}

export function useSignOut(): UseSignOutResult {
  const [error, setError] = useState<string | null>(null);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      const result = await supabase.auth.signOut();
      if (result?.error) {
        setError(SIGN_OUT_GENERIC_ERROR);
        return { ok: false };
      }
      return { ok: true };
    } catch {
      setError(SIGN_OUT_GENERIC_ERROR);
      return { ok: false };
    }
  }, []);

  return { error, signOut };
}
