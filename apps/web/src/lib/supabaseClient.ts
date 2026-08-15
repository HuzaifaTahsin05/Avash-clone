import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * The browser's only Supabase handle — session persistence and
 * auto-refresh so a signed-in user stays signed in across reloads. The
 * anon key is public by design (§4.1); RLS is the real gate, not secrecy
 * of this key.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
