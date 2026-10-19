import type { HouseholdRecipe } from "@/types/database";
import type { RecipeInput } from "@/hooks/useHouseholdRecipes";

/**
 * A HouseholdRecipe-shaped object for a recipe that was extracted but NEVER
 * SAVED — the shopping tab's "just put this on my list" import, for something
 * you'll cook once and don't want cluttering the library.
 *
 * Safe because RecipeAddToListSheet reads only `ingredients`, `servings` and
 * `servings_unit`; there is no `recipe.id` reference anywhere in it, so nothing
 * keys a write off this object. `id` is deliberately the empty string: if it
 * ever reaches code that does need a real row, that fails loudly instead of
 * writing against a plausible-looking fake id.
 *
 * Built as a full stub rather than an `as` cast so that adding a column to
 * household_recipes breaks the build here, instead of silently shipping a
 * half-populated object.
 *
 * Lives in its own module because `RecipeInput` comes from useHouseholdRecipes,
 * which already imports recipeTypes — putting this there would be circular.
 */
export function syntheticRecipe(
  input: RecipeInput,
  householdId: string,
): HouseholdRecipe {
  const now = new Date().toISOString();
  return {
    id: "",
    household_id: householdId,
    name: input.name,
    ingredients: (input.ingredients ?? []) as unknown as HouseholdRecipe["ingredients"],
    steps: (input.steps ?? []) as unknown as HouseholdRecipe["steps"],
    servings: input.servings ?? null,
    servings_unit: input.servingsUnit ?? null,
    prep_minutes: input.prepMinutes ?? null,
    cook_minutes: input.cookMinutes ?? null,
    image_url: input.imageUrl ?? null,
    image_path: input.imagePath ?? null,
    notes: input.notes ?? null,
    description: input.description ?? null,
    tags: input.tags ?? [],
    last_cooked_at: null,
    cook_count: 0,
    source_url: input.sourceUrl ?? null,
    source_kind: input.sourceKind ?? "manual",
    added_by: null,
    created_at: now,
    updated_at: now,
  };
}
