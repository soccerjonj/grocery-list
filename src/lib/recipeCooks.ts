import { createClient } from "@/lib/supabase/client";

/**
 * One line of what a cook actually took out of the pantry. Stored on the
 * recipe_cooks row so an "Undo" can restore exactly, and so no pantry write
 * is unexplained after the fact. Phase 3 (deduction) populates it; Phase 2
 * records cooks with an empty array.
 */
export interface DeductedEntry {
  pantry_item_id: string;
  name: string;
  amount: number;
  unit: string | null;
  prev_quantity: number;
}

/**
 * Record that a recipe was cooked. A DB trigger updates the recipe's
 * cook_count / last_cooked_at from this table, so the library picks it up
 * over realtime without us writing those fields by hand.
 */
export async function recordCook(opts: {
  householdId: string;
  recipeId: string;
  servings?: number | null;
  deducted?: DeductedEntry[];
}): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("recipe_cooks")
    .insert({
      household_id: opts.householdId,
      recipe_id: opts.recipeId,
      cooked_by: user?.id ?? null,
      servings: opts.servings ?? null,
      deducted: (opts.deducted ?? []) as unknown as never,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("recordCook failed:", error?.message);
    return null;
  }
  return data.id;
}

/** Remove a recorded cook (used by the Phase 3 undo path). */
export async function deleteCook(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from("recipe_cooks").delete().eq("id", id);
  if (error) {
    console.error("deleteCook failed:", error.message);
    return false;
  }
  return true;
}
