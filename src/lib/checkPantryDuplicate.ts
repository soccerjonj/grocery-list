import { createClient } from "@/lib/supabase/client";

export async function checkPantryDuplicate(
  householdId: string,
  name: string
): Promise<{ id: string; quantity: number } | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("pantry_items")
    .select("id, quantity")
    .eq("household_id", householdId)
    .ilike("name", name.trim())
    .maybeSingle();
  return data ? { id: data.id, quantity: data.quantity ?? 1 } : null;
}

/** Bulk check — returns a map of lowercase name → { id, quantity } */
export async function getPantryDuplicates(
  householdId: string,
  names: string[]
): Promise<Map<string, { id: string; quantity: number }>> {
  if (names.length === 0) return new Map();
  const supabase = createClient();
  const { data } = await supabase
    .from("pantry_items")
    .select("id, name, quantity")
    .eq("household_id", householdId);

  const map = new Map<string, { id: string; quantity: number }>();
  const lowerNames = new Set(names.map((n) => n.trim().toLowerCase()));
  for (const row of data ?? []) {
    if (lowerNames.has(row.name.toLowerCase())) {
      map.set(row.name.toLowerCase(), { id: row.id, quantity: row.quantity ?? 1 });
    }
  }
  return map;
}

export async function increasePantryQty(id: string, currentQty: number, addAmt: number) {
  const supabase = createClient();
  await supabase
    .from("pantry_items")
    .update({ quantity: currentQty + addAmt, updated_at: new Date().toISOString() })
    .eq("id", id);
}
