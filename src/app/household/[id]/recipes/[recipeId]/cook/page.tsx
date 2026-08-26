"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useToast } from "@/context/ToastContext";
import CookMode from "@/components/recipes/CookMode";
import DeductConfirmSheet from "@/components/recipes/DeductConfirmSheet";
import { useRecipeAvailability } from "@/hooks/useRecipeAvailability";
import { recordCook, deleteCook, type DeductedEntry } from "@/lib/recipeCooks";
import { buildDeductionPlan, type DeductionRow } from "@/lib/recipeDeduct";
import { recipeIngredientList } from "@/lib/recipeTypes";
import { servingsFactor } from "@/lib/recipeScale";

/**
 * Cook mode is a ROUTE, not a modal, so the hardware back button exits it and
 * it can be deep-linked. It stays inside the household layout (rendering as
 * `fixed inset-0 z-50` over the z-30 navs), which keeps HouseholdDataProvider
 * mounted — the pantry deduction below needs live pantry data right here.
 */
export default function CookPage() {
  const params = useParams();
  const recipeId = params.recipeId as string;
  const { householdId } = useHouseholdContext();
  const { recipes: recipesData, pantry } = useHouseholdData();
  const { recipes, loading } = recipesData;
  const { success, error: toastError, withAction } = useToast();
  const { availabilityFor } = useRecipeAvailability();
  const router = useRouter();

  const [finishing, setFinishing] = useState(false);
  const [plan, setPlan] = useState<DeductionRow[] | null>(null);
  const [cookedServings, setCookedServings] = useState<number | null>(null);

  const recipe = recipes.find((r) => r.id === recipeId) ?? null;
  const recipeHref = `/household/${householdId}/recipes/${recipeId}`;

  /** Step 1 — finished cooking: work out what could come out of the pantry. */
  function handleFinish(servings: number | null) {
    if (!recipe) return;
    const factor = servingsFactor(recipe.servings, servings);
    const availability = availabilityFor(recipeIngredientList(recipe), factor);
    setCookedServings(servings);
    setPlan(buildDeductionPlan(availability, factor));
  }

  /** Record the cook; `deducted` is the audit trail that makes Undo exact. */
  async function saveCook(deducted: DeductedEntry[]): Promise<string | null> {
    return recordCook({ householdId, recipeId, servings: cookedServings, deducted });
  }

  /** Step 2a — "Skip": still record that you cooked, just don't touch the pantry. */
  async function handleSkip() {
    if (finishing) return;
    setFinishing(true);
    try {
      const id = await saveCook([]);
      if (!id) throw new Error("Couldn't record this cook");
      success("Nice work — cook recorded");
      router.replace(recipeHref);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't record this cook");
      setFinishing(false);
    }
  }

  /** Step 2b — apply the confirmed deductions, then record the cook. */
  async function handleConfirm(appliedRows: { row: DeductionRow; amount: number }[]) {
    if (finishing) return;
    setFinishing(true);
    const done: DeductedEntry[] = [];
    try {
      for (const { row, amount } of appliedRows) {
        const next = Math.max(0, Number((row.pantryQty - amount).toFixed(2)));
        await pantry.updateQuantity(row.pantryItemId, next);
        done.push({
          pantry_item_id: row.pantryItemId,
          name: row.pantryName,
          amount,
          unit: row.pantryUnit,
          prev_quantity: row.pantryQty,
        });
      }

      // Record LAST, so a failed pantry write can never leave a history row
      // claiming a deduction that didn't happen.
      const cookId = await saveCook(done);

      if (done.length === 0) {
        success("Nice work — cook recorded");
      } else {
        withAction(
          `Updated ${done.length} pantry item${done.length === 1 ? "" : "s"}`,
          {
            label: "Undo",
            onClick: async () => {
              // Restore exactly what we took, from the audit trail.
              for (const d of done) {
                await pantry.updateQuantity(d.pantry_item_id, d.prev_quantity);
              }
              if (cookId) await deleteCook(cookId);
            },
          },
        );
      }
      router.replace(recipeHref);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't update your pantry");
      setFinishing(false);
    }
  }

  if (!recipe) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 flex flex-col items-center justify-center gap-3 px-6 text-center">
        {loading ? (
          <div className="w-6 h-6 border-2 border-gray-300 dark:border-zinc-700 border-t-gray-600 dark:border-t-zinc-300 rounded-full animate-spin" />
        ) : (
          <>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Recipe not found</p>
            <button
              type="button"
              onClick={() => router.replace(`/household/${householdId}/recipes`)}
              className="px-4 py-2 rounded-xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium"
            >
              Back to recipes
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <CookMode
        recipe={recipe}
        finishing={finishing}
        onExit={() => router.replace(recipeHref)}
        onFinish={handleFinish}
      />
      <DeductConfirmSheet
        open={plan !== null}
        rows={plan ?? []}
        busy={finishing}
        onSkip={handleSkip}
        onConfirm={handleConfirm}
      />
    </>
  );
}
