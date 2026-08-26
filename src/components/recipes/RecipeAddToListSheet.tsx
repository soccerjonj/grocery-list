"use client";

import { useState, useEffect } from "react";
import type { HouseholdRecipe } from "@/types/database";
import ItemSheet, { ItemSheetHeader } from "@/components/ui/ItemSheet";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useToast } from "@/context/ToastContext";
import { recipeIngredientList } from "@/lib/recipeTypes";
import { scaleQuantity, formatAmount, servingsFactor } from "@/lib/recipeScale";
import { normalizeItemName } from "@/lib/normalizeItemName";
import { getShoppingDuplicates, increaseShoppingQty } from "@/lib/checkShoppingDuplicate";
import { getErrorMessage } from "@/lib/utils";

/**
 * "Add ingredients to shopping list" — asks how many servings you're actually
 * making FIRST, then shows every scaled amount before adding, so the rounding
 * that scaling implies ("4.5 eggs" → 5) is visible rather than surprising.
 *
 * Adding reuses the app's existing duplicate-merge: an ingredient already on
 * the list gets its quantity increased instead of creating a second row.
 */
export default function RecipeAddToListSheet({
  open,
  onClose,
  recipe,
  householdId,
}: {
  open: boolean;
  onClose: () => void;
  recipe: HouseholdRecipe;
  householdId: string;
}) {
  const { shopping } = useHouseholdData();
  const { success, error: toastError } = useToast();

  const base = recipe.servings ?? null;
  const [target, setTarget] = useState<number>(base ?? 1);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setTarget(base ?? 1); setSkipped(new Set()); }
  }, [open, base]);

  const ingredients = recipeIngredientList(recipe);
  // Only scale when we know the base — otherwise amounts pass through as-is.
  const factor = base ? servingsFactor(base, target) : 1;

  function toggle(i: number) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  async function handleAdd() {
    if (busy) return;
    const keepers = ingredients
      .map((ing, i) => ({ ing, i }))
      .filter(({ ing, i }) => !skipped.has(i) && ing.name.trim());
    if (keepers.length === 0) return;

    setBusy(true);
    try {
      const dupes = await getShoppingDuplicates(
        householdId,
        keepers.map(({ ing }) => ing.name.trim()),
        shopping.activeListId,
      );
      for (const { ing } of keepers) {
        const qty = scaleQuantity(ing.quantity, factor, ing.unit);
        const existing = dupes.get(normalizeItemName(ing.name));
        if (existing) {
          await increaseShoppingQty(existing.id, existing.quantity, qty ?? 1);
        } else {
          await shopping.addItem(ing.name.trim(), qty, ing.unit || undefined);
        }
      }
      success(`Added ${keepers.length} ingredient${keepers.length === 1 ? "" : "s"}`);
      onClose();
    } catch (e) {
      toastError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const addingCount = ingredients.length - skipped.size;

  return (
    <ItemSheet
      open={open}
      onClose={onClose}
      header={<ItemSheetHeader title="Add to shopping list" onClose={onClose} />}
    >
      {/* Servings — the thing that decides every amount below */}
      {base ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-50">How many servings?</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Recipe makes {base}{recipe.servings_unit ? ` ${recipe.servings_unit}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button" aria-label="Fewer servings"
              onClick={() => setTarget((t) => Math.max(1, t - 1))}
              className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 flex items-center justify-center active:scale-90 transition-transform"
            >−</button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-50">{target}</span>
            <button
              type="button" aria-label="More servings"
              onClick={() => setTarget((t) => Math.min(200, t + 1))}
              className="w-8 h-8 rounded-lg bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center active:scale-90 transition-transform"
            >+</button>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          This recipe doesn&apos;t say how many it serves, so amounts are added as written.
          Add a serving count on the recipe to scale it.
        </p>
      )}

      {/* Scaled preview — tap any row to leave it off the list */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
          Adding {addingCount} of {ingredients.length}
        </p>
        <ul className="flex flex-col divide-y divide-gray-50 dark:divide-zinc-800 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3">
          {ingredients.map((ing, i) => {
            const off = skipped.has(i);
            const amount = formatAmount(scaleQuantity(ing.quantity, factor, ing.unit), ing.unit);
            return (
              <li key={`${ing.name}-${i}`}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className="w-full flex items-center gap-3 py-2.5 text-left active:opacity-70"
                >
                  <span
                    className={`flex-shrink-0 w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                      off
                        ? "border-gray-200 dark:border-zinc-700"
                        : "bg-gray-900 dark:bg-zinc-100 border-gray-900 dark:border-zinc-100"
                    }`}
                  >
                    {!off && (
                      <svg className="w-2.5 h-2.5 text-white dark:text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className={`flex-1 text-sm ${off ? "text-gray-300 dark:text-zinc-600 line-through" : "text-gray-800 dark:text-gray-200"}`}>
                    {ing.name}
                  </span>
                  {amount && (
                    <span className={`text-xs tabular-nums flex-shrink-0 ${off ? "text-gray-300 dark:text-zinc-600" : "text-gray-500 dark:text-gray-400"}`}>
                      {amount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={busy || addingCount === 0}
        className="w-full py-3 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all"
      >
        {busy ? "Adding…" : `Add ${addingCount} to list`}
      </button>
    </ItemSheet>
  );
}
