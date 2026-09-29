import { normalizeItemName } from "@/lib/normalizeItemName";
import type { HouseholdTaxonomy } from "@/types/database";

/**
 * "It's still good" — expiry dates the household has chosen to ignore
 * (migration 032). Plenty of food outlives its printed date; without this the
 * pantry nags about the same jar of honey forever.
 *
 * Keyed by item NAME, not row id, so the answer survives rebuying: mark honey
 * once and next year's jar is quiet too.
 *
 * KEYING GOTCHA (same as pantryStaples.ts): household_taxonomy dedupes on
 * lower(label), but every pantry match in this app keys on normalizeItemName,
 * which also folds accents and singularizes. Both sides MUST go through it or
 * "Eggs" would never match an "egg" row.
 */

export const EXPIRY_IGNORED_TYPE = "expiry_ignored";
export const EXPIRY_IGNORED_KIND = "food";

/** Normalized-name set of items whose expiry date should never warn. */
export function buildExpiryIgnoredSet(entries: HouseholdTaxonomy[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (e.type !== EXPIRY_IGNORED_TYPE) continue;
    const key = normalizeItemName(e.label);
    if (key) out.add(key);
  }
  return out;
}

/** Is this item's expiry date being ignored? Safe with an empty/undefined set. */
export function isExpiryIgnored(name: string | null | undefined, ignored?: Set<string>): boolean {
  if (!ignored || ignored.size === 0 || !name) return false;
  const key = normalizeItemName(name);
  return !!key && ignored.has(key);
}
