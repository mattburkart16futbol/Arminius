import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const configurationError =
  Boolean(url) !== Boolean(key)
    ? "Set both Supabase environment variables to enable sign in."
    : url && !URL.canParse(url)
      ? "The Supabase URL is invalid."
      : null;
export const supabase =
  url && key && !configurationError
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
