"use client";

import { useMemo, useCallback } from "react";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { indexPantryRows } from "@/lib/checkPantryDuplicate";
import { computeAvailability } from "@/lib/recipeAvailability";
import type { RecipeIngredient } from "@/lib/recipeTypes";

/**
 * Recipe↔pantry availability, built from the in-memory pantry that
 * HouseholdDataContext already keeps realtime-synced.
 *
 * The index is memoized on `pantry.items`, so checking one recipe or two
 * hundred (the discovery view) costs zero extra queries and stays instantly
 * consistent with what the pantry screen shows.
 */
export function useRecipeAvailability() {
  const { pantry } = useHouseholdData();

  const pantryIndex = useMemo(
    () => indexPantryRows(pantry.items),
    [pantry.items],
  );

  const availabilityFor = useCallback(
    (ingredients: RecipeIngredient[], scaleFactor = 1) =>
      computeAvailability(ingredients, pantryIndex, scaleFactor),
    [pantryIndex],
  );

  return { pantryIndex, availabilityFor };
}
