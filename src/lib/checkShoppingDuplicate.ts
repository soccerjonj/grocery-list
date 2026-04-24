import { createClient } from "@/lib/supabase/client";

export async function checkShoppingDuplicate(
  householdId: string,
  name: string
): Promise<{ id: string; quantity: number } | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("shopping_items")
    .select("id, quantity")
    .eq("household_id", householdId)
    .eq("completed", false)
    .is("cleared_at", null)
    .ilike("name", name.trim())
    .maybeSingle();
  return data ? { id: data.id, quantity: data.quantity ?? 1 } : null;
}

export async function increaseShoppingQty(id: string, currentQty: number, addAmt: number) {
  const supabase = createClient();
  await supabase.from("shopping_items").update({ quantity: currentQty + addAmt }).eq("id", id);
}
