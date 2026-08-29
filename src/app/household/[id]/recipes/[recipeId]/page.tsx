"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useToast } from "@/context/ToastContext";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import RecipeView from "@/components/recipes/RecipeView";
import RecipeEditor from "@/components/recipes/RecipeEditor";
import RecipeAddToListSheet from "@/components/recipes/RecipeAddToListSheet";
import RatingRow from "@/components/recipes/RatingRow";
import { useRecipeRatings } from "@/hooks/useRecipeRatings";
import type { RecipePatch } from "@/hooks/useHouseholdRecipes";
import { getErrorMessage } from "@/lib/utils";

export default function RecipeDetailPage() {
  const params = useParams();
  const recipeId = params.recipeId as string;
  const { householdId } = useHouseholdContext();
  const { recipes: recipesData, members: membersData } = useHouseholdData();
  const { recipes, loading, updateRecipe, deleteRecipe } = recipesData;
  const { success, error: toastError } = useToast();
  const router = useRouter();
  // Called before the not-found early-return below — a hook count that changes
  // between renders is React error #310.
  const { forRecipe, currentUserId, setMyRating } = useRecipeRatings(householdId);

  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const recipe = recipes.find((r) => r.id === recipeId) ?? null;

  async function handleSave(patch: RecipePatch) {
    const ok = await updateRecipe(recipeId, patch);
    if (ok) { setEditing(false); success("Recipe saved"); }
    else toastError("Couldn't save the recipe");
  }

  async function handleDelete() {
    try {
      const ok = await deleteRecipe(recipeId);
      if (!ok) throw new Error("Couldn't delete the recipe");
      router.replace(`/household/${householdId}/recipes`);
    } catch (e) {
      toastError(getErrorMessage(e));
    }
  }

  const backLink = (
    <Link
      href={`/household/${householdId}/recipes`}
      className="inline-flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      Recipes
    </Link>
  );

  // The recipe list is realtime-synced in context; while it's still loading we
  // can't tell "missing" from "not fetched yet", so only claim not-found after.
  if (!recipe) {
    return (
      <div className="max-w-lg lg:max-w-3xl mx-auto px-4 lg:px-8 pt-6 pb-24 lg:pb-12">
        <div className="mb-6">{backLink}</div>
        {loading ? (
          <div className="flex flex-col gap-3">
            <div className="h-48 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 animate-pulse" />
            <div className="h-32 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 animate-pulse" />
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Recipe not found</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              It may have been deleted by someone in your household.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-lg lg:max-w-3xl mx-auto px-4 lg:px-8 pt-6 pb-24 lg:pb-12">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        {backLink}
        {!editing && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors active:scale-95"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete recipe"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-300 dark:text-zinc-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors active:scale-90"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {!editing && (
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 leading-tight mb-5">
          {recipe.name}
        </h1>
      )}

      {editing ? (
        <RecipeEditor recipe={recipe} householdId={householdId} onSave={handleSave} onCancel={() => setEditing(false)} />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Start cooking — the point of the whole section, so it leads. */}
          <button
            type="button"
            onClick={() => router.push(`/household/${householdId}/recipes/${recipeId}/cook`)}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-green-600 text-white text-base font-semibold active:scale-[0.98] transition-transform"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
            </svg>
            Start cooking
          </button>

          <RecipeView recipe={recipe} householdId={householdId} onAddToList={() => setAddOpen(true)} />

          <RatingRow
            ratings={forRecipe(recipeId)}
            currentUserId={currentUserId}
            members={membersData.members}
            onRate={(r) => setMyRating(recipeId, r)}
          />
        </div>
      )}

      <RecipeAddToListSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        recipe={recipe}
        householdId={householdId}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this recipe?"
        danger
        confirmLabel="Delete"
        body={<>&ldquo;{recipe.name}&rdquo; will be removed for everyone in your household. This can&apos;t be undone.</>}
        onConfirm={handleDelete}
      />
    </div>
  );
}
