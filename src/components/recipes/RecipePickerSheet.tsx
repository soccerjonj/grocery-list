"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import ItemSheet, { ItemSheetHeader } from "@/components/ui/ItemSheet";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { recipeIngredientList, totalMinutes, formatMinutes } from "@/lib/recipeTypes";
import RecipeAddToListSheet from "./RecipeAddToListSheet";

/**
 * Shopping's "Add from a recipe" — now a PICKER, not an importer.
 *
 * Creating and editing recipes lives in the Recipes tab; this only answers
 * "put a saved recipe's ingredients on my list". Choosing one hands off to
 * RecipeAddToListSheet, so the servings prompt, scaled amounts, and
 * duplicate-merge behave identically to adding from the recipe page.
 */
export default function RecipePickerSheet({
  open,
  onClose,
  householdId,
}: {
  open: boolean;
  onClose: () => void;
  householdId: string;
}) {
  const { recipes: recipesData } = useHouseholdData();
  const { recipes, loading } = recipesData;
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setQuery(""); setPickedId(null); }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, query]);

  const picked = pickedId ? recipes.find((r) => r.id === pickedId) ?? null : null;

  return (
    <>
      <ItemSheet
        open={open && !picked}
        onClose={onClose}
        header={<ItemSheetHeader title="Add from a recipe" onClose={onClose} />}
      >
        {loading ? (
          <div className="flex flex-col gap-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : recipes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No saved recipes yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Add one in the Recipes tab — from a link, a photo, or by typing it in.
            </p>
            <Link
              href={`/household/${householdId}/recipes`}
              onClick={onClose}
              className="mt-1 px-4 py-2 rounded-xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium"
            >
              Go to Recipes
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {recipes.length > 5 && (
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search recipes…"
                className="w-full text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-gray-900 dark:text-gray-50 placeholder:text-gray-400 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors"
              />
            )}

            <div className="flex flex-col gap-1.5">
              {filtered.map((r) => {
                const count = recipeIngredientList(r).length;
                const time = formatMinutes(totalMinutes(r));
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setPickedId(r.id)}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{r.name}</p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">
                        {[count > 0 ? `${count} ingredient${count === 1 ? "" : "s"}` : null, time]
                          .filter(Boolean).join(" · ") || "No ingredients yet"}
                      </p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 dark:text-zinc-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 py-6 text-center">
                  No recipes match that.
                </p>
              )}
            </div>
          </div>
        )}
      </ItemSheet>

      {picked && (
        <RecipeAddToListSheet
          open
          recipe={picked}
          householdId={householdId}
          onClose={() => { setPickedId(null); onClose(); }}
        />
      )}
    </>
  );
}
