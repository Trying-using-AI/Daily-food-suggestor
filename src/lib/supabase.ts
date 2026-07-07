import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when both Supabase env vars are present. */
export const isSupabaseConfigured = Boolean(url && anonKey);

// Create the client even if unconfigured so imports don't crash; the app shows
// a setup screen (see App.tsx) when isSupabaseConfigured is false.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'public-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
