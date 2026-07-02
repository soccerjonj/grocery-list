import { createClient } from "@/lib/supabase/client";

/**
 * Typed wrappers around the owner-checked household-management RPCs defined
 * in migration 026. All authorization (owner role, sole-owner safeguards)
 * lives in the SECURITY DEFINER functions; these just call them and surface
 * the Postgres error message to the UI.
 */

export async function renameHousehold(householdId: string, name: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("rename_household", {
    p_household_id: householdId,
    p_name: name,
  });
  if (error) throw error;
}

/** Rotate the invite code (revokes old links). Returns the new code. */
export async function regenerateInviteCode(householdId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("regenerate_invite_code", {
    p_household_id: householdId,
  });
  if (error) throw error;
  return data as string;
}

/** Owner removes another (non-owner) member. */
export async function removeHouseholdMember(householdId: string, userId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("remove_household_member", {
    p_household_id: householdId,
    p_user_id: userId,
  });
  if (error) throw error;
}

/** Hand ownership to a member; the caller becomes a regular member. */
export async function transferHouseholdOwnership(householdId: string, newOwnerId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("transfer_household_ownership", {
    p_household_id: householdId,
    p_new_owner: newOwnerId,
  });
  if (error) throw error;
}

/** Leave a household. Throws if the caller is the (sole) owner. */
export async function leaveHousehold(householdId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("leave_household", {
    p_household_id: householdId,
  });
  if (error) throw error;
}

/** Owner deletes the household and all of its data (cascade). */
export async function deleteHousehold(householdId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("delete_household", {
    p_household_id: householdId,
  });
  if (error) throw error;
}

export interface BlockingHousehold {
  id: string;
  name: string;
}

/**
 * Households the caller solely owns that still have other members — these
 * must be transferred or deleted before the account can be deleted.
 */
export async function householdsBlockingAccountDeletion(): Promise<BlockingHousehold[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("households_blocking_account_deletion");
  if (error) throw error;
  return (data ?? []) as BlockingHousehold[];
}
