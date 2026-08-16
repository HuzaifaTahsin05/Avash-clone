import { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export type SignInStatus = 'idle' | 'submitting' | 'error';

/**
 * Fixed, generic messages only — never `error.message` from Supabase
 * (docs/standards/frontend.md R10). Supabase's own error text can leak
 * whether an email is registered, rate-limit internals, or other detail
 * that must not reach the DOM verbatim.
 */
export const SIGN_IN_GENERIC_ERROR =
  'Unable to sign in with those credentials. Check your email and password and try again.';

export interface UseSignInResult {
  status: SignInStatus;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ ok: boolean }>;
}

export function useSignIn(): UseSignInResult {
  const [status, setStatus] = useState<SignInStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async (email: string, password: string) => {
    setStatus('submitting');
    setError(null);

    try {
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result?.error) {
        setStatus('error');
        setError(SIGN_IN_GENERIC_ERROR);
        return { ok: false };
      }
      setStatus('idle');
      return { ok: true };
    } catch {
      setStatus('error');
      setError(SIGN_IN_GENERIC_ERROR);
      return { ok: false };
    }
  }, []);

  return { status, error, signIn };
}
