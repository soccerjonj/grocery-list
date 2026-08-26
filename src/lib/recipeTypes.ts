import type { ExtractedIngredient } from "@/lib/recipeExtract";
import type { HouseholdRecipe } from "@/types/database";

/**
 * Domain types for the recipes/cooking feature.
 *
 * `RecipeIngredient` deliberately EXTENDS the extraction shape rather than
 * replacing it: recipes already saved in production are exactly
 * `{name, quantity?, unit?, raw}`, and adding an optional `group` keeps every
 * one of those rows valid with no data migration. Rows without a group simply
 * render as one flat list.
 */
export interface RecipeIngredient extends ExtractedIngredient {
  /** Optional section heading, e.g. "For the sauce". */
  group?: string;
}

/** One ordered cooking step. */
export interface RecipeStep {
  text: string;
  /** Optional section heading, mirroring ingredient groups. */
  group?: string;
}

/** Read the JSONB ingredients column as typed rows (empty when malformed). */
export function recipeIngredientList(recipe: HouseholdRecipe): RecipeIngredient[] {
  if (!Array.isArray(recipe.ingredients)) return [];
  return recipe.ingredients as unknown as RecipeIngredient[];
}

/** Read the JSONB steps column as typed rows (empty when absent/malformed). */
export function recipeStepList(recipe: HouseholdRecipe): RecipeStep[] {
  if (!Array.isArray(recipe.steps)) return [];
  return (recipe.steps as unknown as RecipeStep[]).filter(
    (s) => s && typeof s.text === "string",
  );
}

/**
 * Group a list into ordered sections, preserving the order groups first
 * appear. Ungrouped entries collect under a leading `null` section so a
 * recipe that mixes both still reads top-to-bottom correctly.
 */
export function groupSections<T extends { group?: string }>(
  rows: T[],
): { group: string | null; rows: T[] }[] {
  const out: { group: string | null; rows: T[] }[] = [];
  for (const row of rows) {
    const g = row.group?.trim() || null;
    const last = out[out.length - 1];
    if (last && last.group === g) last.rows.push(row);
    else out.push({ group: g, rows: [row] });
  }
  return out;
}

/** Total time in minutes, or null when neither part is known. */
export function totalMinutes(recipe: HouseholdRecipe): number | null {
  const p = recipe.prep_minutes ?? 0;
  const c = recipe.cook_minutes ?? 0;
  const t = p + c;
  return t > 0 ? t : null;
}

/** "1 hr 25 min" / "40 min". */
export function formatMinutes(mins: number | null | undefined): string | null {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h) return `${h} hr`;
  return `${m} min`;
}
