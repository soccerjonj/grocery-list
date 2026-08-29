"use client";

import { useMemo, useCallback } from "react";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { indexPantryRows } from "@/lib/checkPantryDuplicate";
import { computeAvailability } from "@/lib/recipeAvailability";
import { buildStapleSet, buildAliasMap } from "@/lib/pantryStaples";
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
  const { pantry, taxonomy } = useHouseholdData();

  const pantryIndex = useMemo(
    () => indexPantryRows(pantry.items),
    [pantry.items],
  );

  // Staples and aliases come off the same realtime taxonomy subscription the
  // pantry's custom pills use — marking a staple updates every recipe at once.
  const staples = useMemo(() => buildStapleSet(taxonomy.entries), [taxonomy.entries]);
  const aliases = useMemo(() => buildAliasMap(taxonomy.entries), [taxonomy.entries]);

  const availabilityFor = useCallback(
    (ingredients: RecipeIngredient[], scaleFactor = 1) =>
      computeAvailability(ingredients, pantryIndex, scaleFactor, { staples, aliases }),
    [pantryIndex, staples, aliases],
  );

  return { pantryIndex, availabilityFor, staples, aliases };
}
