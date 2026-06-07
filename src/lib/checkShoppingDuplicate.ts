import { createClient } from "@/lib/supabase/client";
import { normalizeItemName } from "@/lib/normalizeItemName";

/**
 * Find an existing active (non-completed, non-cleared) shopping row that is
 * "the same item" as `name`. Normalized matching + client-side first-match
 * (no `.maybeSingle()`, which returned null once duplicates existed and
 * silently disabled dedup). Optionally scope to a specific list.
 */
export async function checkShoppingDuplicate(
  householdId: string,
  name: string,
  listId?: string | null
): Promise<{ id: string; quantity: number } | null> {
  const key = normalizeItemName(name);
  if (!key) return null;
  const supabase = createClient();
  let query = supabase
    .from("shopping_items")
    .select("id, name, quantity, created_at")
    .eq("household_id", householdId)
    .eq("completed", false)
    .is("cleared_at", null)
    .order("created_at", { ascending: true });
  if (listId) query = query.eq("list_id", listId);

  const { data } = await query;
  const match = (data ?? []).find((row) => normalizeItemName(row.name) === key);
  return match ? { id: match.id, quantity: match.quantity ?? 1 } : null;
}

/** Bulk check — normalized name → { id, quantity } for active shopping rows. */
export async function getShoppingDuplicates(
  householdId: string,
  names: string[],
  listId?: string | null
): Promise<Map<string, { id: string; quantity: number }>> {
  if (names.length === 0) return new Map();
  const supabase = createClient();
  let query = supabase
    .from("shopping_items")
    .select("id, name, quantity, created_at")
    .eq("household_id", householdId)
    .eq("completed", false)
    .is("cleared_at", null)
    .order("created_at", { ascending: true });
  if (listId) query = query.eq("list_id", listId);

  const { data } = await query;
  const wanted = new Set(names.map(normalizeItemName).filter(Boolean));
  const map = new Map<string, { id: string; quantity: number }>();
  for (const row of data ?? []) {
    const key = normalizeItemName(row.name);
    if (wanted.has(key) && !map.has(key)) {
      map.set(key, { id: row.id, quantity: row.quantity ?? 1 });
    }
  }
  return map;
}

export async function increaseShoppingQty(id: string, currentQty: number, addAmt: number) {
  const supabase = createClient();
  await supabase.from("shopping_items").update({ quantity: currentQty + addAmt }).eq("id", id);
}
