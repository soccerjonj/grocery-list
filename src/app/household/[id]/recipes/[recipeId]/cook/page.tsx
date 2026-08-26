"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useToast } from "@/context/ToastContext";
import CookMode from "@/components/recipes/CookMode";
import { recordCook } from "@/lib/recipeCooks";

/**
 * Cook mode is a ROUTE, not a modal, so the hardware back button exits it and
 * it can be deep-linked. It stays inside the household layout (rendering as
 * `fixed inset-0 z-50` over the z-30 navs), which keeps HouseholdDataProvider
 * mounted — Phase 3's pantry deduction needs live pantry data right here.
 */
export default function CookPage() {
  const params = useParams();
  const recipeId = params.recipeId as string;
  const { householdId } = useHouseholdContext();
  const { recipes: recipesData } = useHouseholdData();
  const { recipes, loading } = recipesData;
  const { success, error: toastError } = useToast();
  const router = useRouter();

  const [finishing, setFinishing] = useState(false);
  const recipe = recipes.find((r) => r.id === recipeId) ?? null;
  const recipeHref = `/household/${householdId}/recipes/${recipeId}`;

  async function handleFinish(servings: number | null) {
    if (finishing) return;
    setFinishing(true);
    try {
      const id = await recordCook({ householdId, recipeId, servings });
      if (!id) throw new Error("Couldn't record this cook");
      success("Nice work — cook recorded");
      router.replace(recipeHref);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't record this cook");
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
    <CookMode
      recipe={recipe}
      finishing={finishing}
      onExit={() => router.replace(recipeHref)}
      onFinish={handleFinish}
    />
  );
}
