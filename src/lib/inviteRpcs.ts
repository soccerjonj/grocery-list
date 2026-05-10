import { createClient } from "@/lib/supabase/client";

/**
 * Typed wrappers around the invite-flow RPCs defined in migration 016.
 * See supabase/migrations/016_invite_rpcs.sql for the SQL definitions and
 * the rationale for SECURITY DEFINER + grants.
 */

export interface InviteContext {
  householdId: string;
  householdName: string;
  takenColors: string[];
}

/**
 * Anonymous-callable. Returns null when the code doesn't match a household
 * (so callers can fall back gracefully — invalid invite shouldn't break
 * signup). Used by the signup page to show "Joining X" and pre-filter the
 * color picker.
 */
export async function lookupInvite(code: string): Promise<InviteContext | null> {
  if (!code || !code.trim()) return null;
  const supabase = createClient();
  const { data, error } = await supabase
    .rpc("lookup_invite", { p_code: code.trim() })
    .maybeSingle<{
      household_id: string;
      household_name: string;
      taken_colors: string[] | null;
    }>();
  if (error || !data) return null;
  return {
    householdId: data.household_id,
    householdName: data.household_name,
    takenColors: data.taken_colors ?? [],
  };
}

/**
 * Authenticated-only. Joins the calling user to the household identified
 * by `code`. Idempotent (already-member returns the household_id without
 * inserting). Throws if the code is invalid or the user isn't authenticated.
 *
 * Returns the household_id on success so the caller can route to
 * /household/{id}/pantry.
 */
export async function joinHouseholdWithCode(code: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("join_household_with_code", {
    p_code: code.trim(),
  });
  if (error) throw error;
  if (!data) throw new Error("Failed to join household");
  return data as string;
}
