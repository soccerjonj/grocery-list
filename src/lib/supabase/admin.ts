import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for trusted server-to-server reads (e.g. the
 * dashboard API in /api/v1/*). Bypasses Row-Level Security, so it must ONLY
 * ever be used behind a separate auth gate (a shared API token) — never with
 * user-supplied filters that could leak another household's data.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in the environment (Settings → API →
 * "service_role" secret on the Supabase dashboard). Never expose this key to
 * the browser — it is intentionally NOT prefixed with NEXT_PUBLIC_.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client missing env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    );
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
