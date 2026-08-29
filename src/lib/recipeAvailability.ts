import type { RecipeIngredient } from "@/lib/recipeTypes";
import type { PantryIndexEntry } from "@/lib/checkPantryDuplicate";
import { normalizeItemName } from "@/lib/normalizeItemName";
import { comparable, convert } from "@/lib/unitConvert";

/**
 * How a single recipe ingredient stands against the pantry.
 *
 *  missing — not in the pantry at all. The only state that counts against you.
 *  have    — in the pantry, and either no amount is needed ("salt to taste")
 *            or the units are comparable and there's enough.
 *  low     — comparable units, but the pantry has less than the recipe needs.
 *  unknown — in the pantry, but the amounts can't be honestly compared
 *            (2 cups vs 1 bag). We show both rather than pretend.
 */
export type IngredientState = "have" | "low" | "unknown" | "missing" | "staple";

export interface IngredientAvailability {
  ingredient: RecipeIngredient;
  state: IngredientState;
  pantry: PantryIndexEntry | null;
  /** Needed amount expressed in the pantry's unit, when comparable. */
  neededInPantryUnit: number | null;
  /** How much short we are, in the pantry's unit (only when `low`). */
  shortfall: number | null;
}

export interface RecipeAvailability {
  rows: IngredientAvailability[];
  /** Ingredients we believe you have (have + low + unknown). */
  haveCount: number;
  /** Non-optional ingredients — the denominator of "7 of 9". */
  totalCount: number;
  missing: IngredientAvailability[];
  low: IngredientAvailability[];
}

/**
 * Compare a recipe's ingredients against a pantry index.
 *
 * `scaleFactor` lets availability reflect the servings you actually intend to
 * cook, so doubling a recipe can legitimately turn "have" into "low".
 */
export function computeAvailability(
  ingredients: RecipeIngredient[],
  pantryIndex: Map<string, PantryIndexEntry>,
  scaleFactor = 1,
  opts: { staples?: Set<string>; aliases?: Map<string, string> } = {},
): RecipeAvailability {
  const { staples, aliases } = opts;

  const rows: IngredientAvailability[] = ingredients.map((ingredient) => {
    const rawKey = normalizeItemName(ingredient.name);
    // Resolve an alias BEFORE the pantry lookup, so "high heat cooking oil"
    // finds the avocado oil row and inherits its real quantity/unit.
    const key = (rawKey && aliases?.get(rawKey)) || rawKey;
    const pantry = (key && pantryIndex.get(key)) || null;

    // A staple is assumed on hand whether or not a pantry row exists, so it
    // never nags. Checked on both the raw phrase and the aliased target.
    if (staples && ((rawKey && staples.has(rawKey)) || (key && staples.has(key)))) {
      return { ingredient, state: "staple" as const, pantry, neededInPantryUnit: null, shortfall: null };
    }

    if (!pantry) {
      return { ingredient, state: "missing" as const, pantry: null, neededInPantryUnit: null, shortfall: null };
    }

    // No amount required — being in the kitchen is enough ("a pinch of salt").
    if (ingredient.quantity === undefined || !Number.isFinite(ingredient.quantity)) {
      return { ingredient, state: "have" as const, pantry, neededInPantryUnit: null, shortfall: null };
    }

    const needed = ingredient.quantity * scaleFactor;
    if (!comparable(ingredient.unit, pantry.unit)) {
      return { ingredient, state: "unknown" as const, pantry, neededInPantryUnit: null, shortfall: null };
    }

    const neededInPantryUnit = convert(needed, ingredient.unit, pantry.unit);
    if (neededInPantryUnit === null) {
      return { ingredient, state: "unknown" as const, pantry, neededInPantryUnit: null, shortfall: null };
    }

    if (pantry.quantity + 1e-9 >= neededInPantryUnit) {
      return { ingredient, state: "have" as const, pantry, neededInPantryUnit, shortfall: null };
    }
    return {
      ingredient,
      state: "low" as const,
      pantry,
      neededInPantryUnit,
      shortfall: neededInPantryUnit - pantry.quantity,
    };
  });

  // Optional ingredients ("garnish") shouldn't make a recipe look un-cookable.
  const counted = rows.filter((r) => !r.ingredient.optional);
  return {
    rows,
    haveCount: counted.filter((r) => r.state !== "missing").length,
    totalCount: counted.length,
    missing: rows.filter((r) => r.state === "missing"),
    low: rows.filter((r) => r.state === "low"),
  };
}
