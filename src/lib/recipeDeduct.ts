import type { RecipeAvailability } from "@/lib/recipeAvailability";

/**
 * One proposed pantry deduction, ready to be shown with an adjustable stepper.
 *
 * `suggested` is intentionally 0 whenever we can't compare units honestly, or
 * when the ingredient has no amount ("salt to taste") — the ambiguous cases
 * become opt-in rather than something that silently drains your pantry.
 */
export interface DeductionRow {
  key: string;
  ingredientName: string;
  pantryItemId: string;
  pantryName: string;
  pantryQty: number;
  pantryUnit: string | null;
  /** What the recipe asked for, in the recipe's own unit (for display). */
  neededQty: number | null;
  neededUnit: string | null;
  /** Pre-filled deduction, expressed in the PANTRY's unit. */
  suggested: number;
  /** False when units couldn't be compared — the UI explains rather than guesses. */
  comparable: boolean;
}

/**
 * Turn an availability result into the rows of the post-cook confirm screen.
 * Only ingredients we actually found in the pantry appear — you can't deduct
 * what you never had.
 */
export function buildDeductionPlan(availability: RecipeAvailability, scaleFactor = 1): DeductionRow[] {
  const rows: DeductionRow[] = [];
  availability.rows.forEach((r, i) => {
    if (!r.pantry) return; // missing — nothing to deduct

    const hasAmount = r.ingredient.quantity !== undefined && Number.isFinite(r.ingredient.quantity);
    const isComparable = r.neededInPantryUnit !== null;

    // Never propose taking more than the pantry actually holds.
    const suggested = isComparable
      ? Math.min(r.pantry.quantity, r.neededInPantryUnit as number)
      : 0;

    rows.push({
      key: `${r.pantry.id}-${i}`,
      ingredientName: r.ingredient.name,
      pantryItemId: r.pantry.id,
      pantryName: r.pantry.name,
      pantryQty: r.pantry.quantity,
      pantryUnit: r.pantry.unit,
      neededQty: hasAmount ? (r.ingredient.quantity as number) * scaleFactor : null,
      neededUnit: r.ingredient.unit ?? null,
      suggested: Math.max(0, Number(suggested.toFixed(2))),
      comparable: isComparable,
    });
  });
  return rows;
}
