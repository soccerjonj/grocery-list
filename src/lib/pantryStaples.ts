import { normalizeItemName } from "@/lib/normalizeItemName";
import type { HouseholdTaxonomy } from "@/types/database";

/**
 * Staples and aliases, read out of household_taxonomy (migration 030).
 *
 * KEYING GOTCHA: the taxonomy table dedupes on `lower(label)`, but every
 * pantry/recipe match in this app keys on `normalizeItemName` (which also
 * folds accents and singularizes). So both lookups below MUST re-key through
 * normalizeItemName, or "Eggs" as a staple would never match an "egg"
 * ingredient.
 */

export const STAPLE_TYPE = "staple";
export const ALIAS_TYPE = "ingredient_alias";
export const INGREDIENT_KIND = "ingredient";

/** Normalized-name set of things the household always has on hand. */
export function buildStapleSet(entries: HouseholdTaxonomy[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (e.type !== STAPLE_TYPE) continue;
    const key = normalizeItemName(e.label);
    if (key) out.add(key);
  }
  return out;
}

/**
 * Normalized recipe-phrase → normalized pantry-item name.
 * "high heat cooking oil" → "avocado oil"
 */
export function buildAliasMap(entries: HouseholdTaxonomy[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of entries) {
    if (e.type !== ALIAS_TYPE || !e.target) continue;
    const from = normalizeItemName(e.label);
    const to = normalizeItemName(e.target);
    if (from && to) out.set(from, to);
  }
  return out;
}

/**
 * Suggested starting staples. Mirrors the "Pantry condiments, baking & staples"
 * keyword block in pantryHints.ts — the things nobody wants to be told they're
 * missing. Offered as a one-tap seed, never applied silently: a household that
 * genuinely tracks its olive oil should be able to decline.
 */
export const SUGGESTED_STAPLES = [
  "Salt", "Black Pepper", "Olive Oil", "Vegetable Oil", "Butter",
  "Sugar", "All-Purpose Flour", "Water",
  "Garlic Powder", "Onion Powder", "Paprika", "Cumin", "Chili Powder",
  "Cinnamon", "Oregano", "Basil", "Thyme", "Bay Leaves", "Red Pepper Flakes",
];
