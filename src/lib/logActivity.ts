import { createClient } from "@/lib/supabase/client";

/** Fire-and-forget — never throws, never blocks the caller. */
export async function logActivity(
  householdId: string,
  action: string,
  itemName?: string | null,
): Promise<void> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("activity_log").insert({
      household_id: householdId,
      user_id: user.id,
      action,
      item_name: itemName ?? null,
    });
  } catch {
    // non-critical — swallow
  }
}
