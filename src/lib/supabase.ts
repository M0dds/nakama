import { createClient } from "@supabase/supabase-js";

/**
 * Single Supabase browser client for the whole app. We point at the same
 * project the Logbook codebase used — schema, RLS, RPCs and Realtime are
 * already in place. No service-role key here; everything goes through RLS.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.local from Logbook.",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
