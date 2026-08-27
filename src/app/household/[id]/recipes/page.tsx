"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useToast } from "@/context/ToastContext";
import ActivityBellButton from "@/components/household/ActivityBellFloat";
import RecipeCard from "@/components/recipes/RecipeCard";
import RecipeCreateSheet from "@/components/recipes/RecipeCreateSheet";
import { normalizeItemName } from "@/lib/normalizeItemName";
import { recipeIngredientList } from "@/lib/recipeTypes";
import { useRecipeAvailability } from "@/hooks/useRecipeAvailability";
import type { RecipeInput } from "@/hooks/useHouseholdRecipes";
import { getErrorMessage } from "@/lib/utils";

export default function RecipesPage() {
  const { householdId, householdName } = useHouseholdContext();
  const { recipes: recipesData, taxonomy } = useHouseholdData();
  const { recipes, loading, loadError, saveRecipe } = recipesData;
  const { error: toastError } = useToast();
  const { availabilityFor } = useRecipeAvailability();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [cookableOnly, setCookableOnly] = useState(false);
  const [creating, setCreating] = useState(false);

  const tags = taxonomy.listFor("recipe_tag", "recipe");

  // Search matches the recipe name AND its ingredients, so "chicken" finds
  // recipes that use chicken even when it isn't in the title.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qKey = normalizeItemName(query);
    return recipes.filter((r) => {
      if (activeTag && !(r.tags ?? []).includes(activeTag)) return false;
      if (!q) return true;
      if (r.name.toLowerCase().includes(q)) return true;
      return recipeIngredientList(r).some(
        (i) => i.name.toLowerCase().includes(q) || normalizeItemName(i.name) === qKey,
      );
    });
  }, [recipes, query, activeTag]);

  /**
   * "What can I cook?" — score every recipe against the pantry and sort by how
   * little is missing. Reads the in-memory pantry index (one shared build), so
   * this stays a pure computation with no extra queries no matter how many
   * recipes there are.
   */
  const ranked = useMemo(() => {
    const withAvail = filtered.map((r) => {
      const ings = recipeIngredientList(r);
      const a = ings.length > 0 ? availabilityFor(ings) : null;
      return { recipe: r, missing: a ? a.missing.length : null, total: a?.totalCount ?? 0, have: a?.haveCount ?? 0 };
    });
    if (!cookableOnly) return withAvail;
    // Only recipes we can actually make — and an empty ingredient list isn't
    // evidence of anything, so those are excluded rather than counted as ready.
    return withAvail
      .filter((x) => x.total > 0 && x.missing === 0)
      .sort((a, b) => b.total - a.total);
  }, [filtered, cookableOnly, availabilityFor]);

  const readyCount = useMemo(
    () => {
      let n = 0;
      for (const r of recipes) {
        const ings = recipeIngredientList(r);
        if (ings.length === 0) continue;
        const a = availabilityFor(ings);
        if (a.totalCount > 0 && a.missing.length === 0) n += 1;
      }
      return n;
    },
    [recipes, availabilityFor],
  );

  async function handleCreate(input: RecipeInput) {
    try {
      const id = await saveRecipe(input);
      if (!id) throw new Error("Couldn't create the recipe");
      setCreating(false);
      router.push(`/household/${householdId}/recipes/${id}`);
    } catch (e) {
      toastError(getErrorMessage(e));
    }
  }

  return (
    <div className="max-w-lg lg:max-w-5xl mx-auto px-4 lg:px-8 pt-6 pb-24 lg:pb-12">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-medium tracking-wide mb-0.5">
            {householdName}
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Recipes</h1>
        </div>
        {/* Bell + settings duplicate the desktop sidebar — hide at lg. */}
        <div className="flex items-center gap-2 lg:hidden">
          <ActivityBellButton householdId={householdId} />
          <Link
            href={`/household/${householdId}/settings`}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors active:opacity-60"
            aria-label="Settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
        </div>
      </div>

      {/* ── Search + new ───────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-0">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes or ingredients…"
            className="w-full text-sm bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl pl-9 pr-3 py-2.5 text-gray-900 dark:text-gray-50 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none focus:border-gray-300 dark:focus:border-zinc-600 transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium active:scale-[0.97] transition-transform"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>
      </div>

      {/* ── "What can I cook?" ─────────────────────────────── */}
      {readyCount > 0 && (
        <button
          type="button"
          onClick={() => setCookableOnly((v) => !v)}
          className={`w-full mb-4 flex items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left transition-colors active:scale-[0.99] ${
            cookableOnly
              ? "border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/30"
              : "border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
          }`}
        >
          <span className="w-7 h-7 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-gray-900 dark:text-gray-50">
              {readyCount} ready to cook
            </span>
            <span className="block text-[11px] text-gray-400 dark:text-gray-500">
              {cookableOnly ? "Showing only these — tap to show all" : "You have everything for these right now"}
            </span>
          </span>
          <svg
            className={`w-4 h-4 flex-shrink-0 transition-colors ${cookableOnly ? "text-green-600 dark:text-green-400" : "text-gray-300 dark:text-zinc-600"}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* ── Tag filter ─────────────────────────────────────── */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTag((cur) => (cur === t ? null : t))}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                activeTag === t
                  ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* ── Body ───────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-40 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 animate-pulse"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Couldn&apos;t load your recipes
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            Your recipes are safe — this is a temporary loading problem. Pull down to refresh.
          </p>
        </div>
      ) : ranked.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 dark:bg-zinc-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3-2 2 2 2-2 2 2 2-2 3 2zM9 7h6M9 11h6M9 15h4" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {cookableOnly ? "Nothing fully in stock" : query ? "No recipes match that" : "No recipes yet"}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {cookableOnly
                ? "Tap the banner above to show all recipes."
                : query ? "Try a different search." : "Add your first recipe to start cooking."}
            </p>
          </div>
          {!query && !cookableOnly && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-1 px-4 py-2 rounded-xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium active:scale-[0.97] transition-transform"
            >
              New recipe
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <AnimatePresence mode="popLayout">
            {ranked.map(({ recipe: r, missing }) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.18 }}
              >
                <RecipeCard recipe={r} householdId={householdId} missingCount={missing} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <RecipeCreateSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
