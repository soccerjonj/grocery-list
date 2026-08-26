import { createClient } from "@/lib/supabase/client";
import { normalizeItemName } from "@/lib/normalizeItemName";

/**
 * Find an existing pantry row that is "the same item" as `name`.
 *
 * Matching is on the normalized key (case/whitespace/plural-folded), not a
 * raw `ilike`, so "Eggs" finds "egg". We fetch the household's rows and match
 * client-side rather than using `.maybeSingle()` — the old approach returned
 * null the moment two rows shared a name, silently disabling dedup forever and
 * letting duplicates compound. Households hold at most a few hundred items, so
 * one scoped SELECT is cheap.
 */
export async function checkPantryDuplicate(
  householdId: string,
  name: string
): Promise<{ id: string; quantity: number } | null> {
  const key = normalizeItemName(name);
  if (!key) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from("pantry_items")
    .select("id, name, quantity, created_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });

  const match = (data ?? []).find((row) => normalizeItemName(row.name) === key);
  return match ? { id: match.id, quantity: match.quantity ?? 1 } : null;
}

export interface PantryIndexEntry {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
}

/**
 * Build the normalized-name → pantry-row index.
 *
 * Exported so recipe availability can index the in-memory (realtime-synced)
 * pantry from context instead of issuing one SELECT per recipe — checking 200
 * recipes on the discovery screen would otherwise be 200 round-trips. Sharing
 * this exact loop is also what guarantees availability and the dedup users
 * already see can never disagree.
 *
 * Rows are sorted oldest-first so the canonical (first-created) row always
 * wins, matching how duplicate merging behaves everywhere else.
 */
export function indexPantryRows(
  rows: { id: string; name: string; quantity: number | null; unit: string | null; created_at?: string }[]
): Map<string, PantryIndexEntry> {
  const sorted = [...rows].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const map = new Map<string, PantryIndexEntry>();
  for (const row of sorted) {
    const key = normalizeItemName(row.name);
    if (!key || map.has(key)) continue;
    map.set(key, { id: row.id, name: row.name, quantity: row.quantity ?? 1, unit: row.unit ?? null });
  }
  return map;
}

/** Bulk check — returns a map of normalized name → { id, quantity, unit }. */
export async function getPantryDuplicates(
  householdId: string,
  names: string[]
): Promise<Map<string, PantryIndexEntry>> {
  if (names.length === 0) return new Map();
  const supabase = createClient();
  const { data } = await supabase
    .from("pantry_items")
    .select("id, name, quantity, unit, created_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });

  const wanted = new Set(names.map(normalizeItemName).filter(Boolean));
  const full = indexPantryRows(data ?? []);
  const map = new Map<string, PantryIndexEntry>();
  for (const [key, entry] of full) {
    if (wanted.has(key)) map.set(key, entry);
  }
  return map;
}

export interface MergeMeta {
  kind?: string | null;
  storageLocation?: string | null;
  fridgeZone?: string | null;
  foodCategory?: string | null;
  /** Filled into the existing row only when the existing unit is empty. */
  unit?: string | null;
  /** Incoming expiry — applied when the existing row has none, else the
   *  EARLIER of the two is kept (waste-first: surface the soonest-to-expire). */
  expiresAt?: string | null;
  /** Unioned with the existing assignees, never overwritten. */
  assignedTo?: string[] | null;
}

/**
 * Increment an existing pantry row's quantity and merge in metadata without
 * losing data. Previously this only wrote quantity + classification fields, so
 * an import that set an expiry or assignee on a row that merged silently
 * dropped both — the most damaging bug in the finish-trip → pantry flow.
 */
export async function increasePantryQty(
  id: string,
  currentQty: number,
  addAmt: number,
  meta?: MergeMeta
) {
  const supabase = createClient();

  // Read what we need to merge non-destructively.
  const { data: existing } = await supabase
    .from("pantry_items")
    .select("expires_at, assigned_to, unit, kind, storage_location, fridge_zone, food_category")
    .eq("id", id)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    quantity: currentQty + addAmt,
    updated_at: new Date().toISOString(),
  };

  // Classification: FILL GAPS ONLY. A restock must never overwrite the tags
  // the existing item already has — we only populate fields it left blank.
  if (meta?.kind != null            && !existing?.kind)             patch.kind             = meta.kind;
  if (meta?.storageLocation != null && !existing?.storage_location) patch.storage_location = meta.storageLocation;
  if (meta?.fridgeZone != null      && !existing?.fridge_zone)      patch.fridge_zone      = meta.fridgeZone;
  if (meta?.foodCategory != null    && !existing?.food_category)    patch.food_category    = meta.foodCategory;

  // Unit: fill the gap, never clobber an existing unit.
  if (meta?.unit && !existing?.unit) patch.unit = meta.unit;

  // Expiry: ISO "YYYY-MM-DD" strings compare lexicographically, so `<` is a
  // valid date compare. Keep the earlier date so Use-Soon still warns about
  // the soonest-expiring stock in the merged pile.
  if (meta?.expiresAt) {
    const ex = existing?.expires_at as string | null | undefined;
    patch.expires_at = !ex ? meta.expiresAt : (meta.expiresAt < ex ? meta.expiresAt : ex);
  }

  // Assignees: union with whoever was already assigned.
  if (meta?.assignedTo && meta.assignedTo.length > 0) {
    const cur = (existing?.assigned_to as string[] | null) ?? [];
    const union = Array.from(new Set([...cur, ...meta.assignedTo]));
    patch.assigned_to = union.length > 0 ? union : null;
  }

  await supabase.from("pantry_items").update(patch).eq("id", id);
}
