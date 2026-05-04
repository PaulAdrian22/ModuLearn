import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surface this loud and early during the rebuild — most pages will not work without it.
  // eslint-disable-next-line no-console
  console.error(
    '[ModuLearn] Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY. ' +
      'Copy frontend/.env.example to frontend/.env.local and fill in your Supabase project values.'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

// Username-only login: Supabase Auth requires an email, so we synthesize one
// from the username. The user never sees this email.
export const SYNTHETIC_EMAIL_DOMAIN = 'modulearn.local';
export const usernameToEmail = (username) =>
  `${String(username).trim().toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
