import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key && !/YOUR-PROJECT-REF|YOUR-PUBLISHABLE/.test(url + key));

let client: SupabaseClient | null = null;

/** Null when the project is not configured, so callers surface setup instead of crashing. */
export function supabase(): SupabaseClient | null {
  if (!isConfigured) return null;
  if (!client) client = createClient(url as string, key as string);
  return client;
}
