"use client";

import { useState } from "react";
import ItemSheet, { ItemSheetHeader } from "@/components/ui/ItemSheet";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useToast } from "@/context/ToastContext";
import { formatAmount, scaleQuantity } from "@/lib/recipeScale";
import { normalizeItemName } from "@/lib/normalizeItemName";
import { getPantryHint } from "@/lib/pantryHints";
import { getShoppingDuplicates, increaseShoppingQty } from "@/lib/checkShoppingDuplicate";
import { STAPLE_TYPE, ALIAS_TYPE, INGREDIENT_KIND } from "@/lib/pantryStaples";
import type { IngredientAvailability } from "@/lib/recipeAvailability";
import { getErrorMessage } from "@/lib/utils";

/**
 * Tap an ingredient → what you have, and the four things you might want to do
 * about it. Exists because "add all missing" is all-or-nothing: an out-of-date
 * pantry, a staple you never track, or a naming mismatch each needed a way out
 * that didn't involve editing the recipe.
 */
export default function IngredientSheet({
  row,
  factor,
  householdId,
  onClose,
}: {
  row: IngredientAvailability | null;
  factor: number;
  householdId: string;
  onClose: () => void;
}) {
  const { pantry, shopping, taxonomy } = useHouseholdData();
  const { success, error: toastError } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const ing = row?.ingredient ?? null;
  const needed = ing ? scaleQuantity(ing.quantity, factor, ing.unit) : undefined;
  const neededLabel = ing ? formatAmount(needed, ing.unit) : null;

  async function run(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try { await fn(); } catch (e) { toastError(getErrorMessage(e)); }
    finally { setBusy(null); }
  }

  async function addToPantry() {
    if (!ing) return;
    await run("pantry", async () => {
      const hint = getPantryHint(ing.name);
      await pantry.addItem(ing.name, needed ?? 1, ing.unit || undefined, {
        kind: hint?.kind ?? "food",
        storageLocation: hint?.storage_location ?? null,
        foodCategory: hint?.food_category ?? null,
        fridgeZone: hint?.fridge_zone ?? null,
      });
      success(`Added ${ing.name} to your pantry`);
      onClose();
    });
  }

  async function bumpPantry(delta: number) {
    if (!row?.pantry) return;
    const next = Math.max(0, Number((row.pantry.quantity + delta).toFixed(2)));
    await run("bump", async () => {
      await pantry.updateQuantity(row.pantry!.id, next);
    });
  }

  async function addToList() {
    if (!ing) return;
    await run("list", async () => {
      // Same duplicate-merge the batch path uses, so adding one ingredient
      // can't create a second row for something already on the list.
      const dupes = await getShoppingDuplicates(householdId, [ing.name], shopping.activeListId);
      const existing = dupes.get(normalizeItemName(ing.name));
      if (existing) {
        await increaseShoppingQty(existing.id, existing.quantity, needed ?? 1);
      } else {
        await shopping.addItem(ing.name, needed ?? undefined, ing.unit || undefined);
      }
      success(`Added ${ing.name} to your list`);
      onClose();
    });
  }

  async function toggleStaple() {
    if (!ing) return;
    await run("staple", async () => {
      if (row?.state === "staple") {
        await taxonomy.remove(STAPLE_TYPE, INGREDIENT_KIND, ing.name);
        success(`${ing.name} is no longer a staple`);
      } else {
        await taxonomy.add(STAPLE_TYPE, INGREDIENT_KIND, ing.name);
        success(`${ing.name} marked as a staple`);
      }
      onClose();
    });
  }

  async function linkTo(pantryName: string) {
    if (!ing) return;
    await run("link", async () => {
      await taxonomy.add(ALIAS_TYPE, INGREDIENT_KIND, ing.name, pantryName);
      success(`"${ing.name}" now means ${pantryName}`);
      onClose();
    });
  }

  const isStaple = row?.state === "staple";

  return (
    <ItemSheet
      open={row !== null}
      onClose={onClose}
      header={
        <ItemSheetHeader
          title={ing?.name ?? ""}
          meta={
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {neededLabel ? `Recipe needs ${neededLabel}` : "No amount specified"}
            </span>
          }
          onClose={onClose}
        />
      }
    >
      {/* What you have */}
      <div className="rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex flex-col gap-3">
        {isStaple ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Marked as a staple — assumed always on hand, so it never shows as missing.
          </p>
        ) : row?.pantry ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">In your pantry</span>
              <span className="text-base font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                {formatAmount(row.pantry.quantity, row.pantry.unit) ?? row.pantry.quantity}
              </span>
            </div>
            {row.state === "low" && row.shortfall !== null && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Short by about {formatAmount(row.shortfall, row.pantry.unit)}.
              </p>
            )}
            {row.state === "unknown" && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Different units, so we can&apos;t compare these honestly — you decide.
              </p>
            )}
            {/* Quick correction for a pantry that's drifted out of date. */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-1">Adjust</span>
              <button type="button" onClick={() => bumpPantry(-1)} disabled={!!busy}
                className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 text-lg active:scale-90 transition-transform disabled:opacity-40">−</button>
              <button type="button" onClick={() => bumpPantry(1)} disabled={!!busy}
                className="w-9 h-9 rounded-xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-lg active:scale-90 transition-transform disabled:opacity-40">+</button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Not in your pantry.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        {!row?.pantry && !isStaple && (
          <button type="button" onClick={addToPantry} disabled={!!busy}
            className="w-full py-3 rounded-2xl bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-100 text-sm font-medium active:scale-[0.98] transition-transform disabled:opacity-50">
            {busy === "pantry" ? "Adding…" : "Add to pantry"}
          </button>
        )}
        <button type="button" onClick={addToList} disabled={!!busy}
          className="w-full py-3 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium active:scale-[0.98] transition-transform disabled:opacity-50">
          {busy === "list" ? "Adding…" : "Add just this to shopping list"}
        </button>
        <button type="button" onClick={toggleStaple} disabled={!!busy}
          className="w-full py-3 rounded-2xl bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 text-sm font-medium active:scale-[0.98] transition-transform disabled:opacity-50">
          {isStaple ? "Remove from staples" : "Always have this (staple)"}
        </button>

        {/* Link to a pantry item — the "high heat cooking oil" IS "avocado oil" case */}
        {!linking ? (
          <button type="button" onClick={() => setLinking(true)} disabled={!!busy}
            className="w-full py-3 rounded-2xl border border-dashed border-gray-300 dark:border-zinc-600 text-gray-600 dark:text-gray-300 text-sm font-medium active:scale-[0.98] transition-transform disabled:opacity-50">
            This is something I already have…
          </button>
        ) : (
          <div className="rounded-2xl border border-gray-200 dark:border-zinc-700 p-3 flex flex-col gap-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Which pantry item does &ldquo;{ing?.name}&rdquo; mean? Saved for future recipes too.
            </p>
            <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
              {pantry.items.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">Your pantry is empty.</p>
              )}
              {pantry.items.map((p) => (
                <button key={p.id} type="button" onClick={() => linkTo(p.name)} disabled={!!busy}
                  className="text-left px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800 text-sm text-gray-800 dark:text-gray-100 disabled:opacity-50">
                  {p.name}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setLinking(false)}
              className="text-xs text-gray-400 dark:text-gray-500 py-1">Cancel</button>
          </div>
        )}
      </div>
    </ItemSheet>
  );
}
