"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { HouseholdRecipe } from "@/types/database";
import { recipeIngredientList, recipeStepList, groupSections } from "@/lib/recipeTypes";
import { scaleQuantity, formatAmount, servingsFactor } from "@/lib/recipeScale";
import { useWakeLock } from "@/hooks/useWakeLock";

/**
 * Full-screen guided cooking. Page 0 is the ingredient checklist ("mise en
 * place"); pages 1..n are the steps, one at a time in large type.
 *
 * Deliberately no timers — cooking is the focus, and a half-built timer that
 * dies when the tab sleeps is worse than none.
 */
export default function CookMode({
  recipe,
  onExit,
  onFinish,
  finishing,
}: {
  recipe: HouseholdRecipe;
  onExit: () => void;
  onFinish: (servings: number | null) => void;
  finishing: boolean;
}) {
  const base = recipe.servings ?? null;
  const [target, setTarget] = useState<number | null>(base);
  const [page, setPage] = useState(0);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  // Called unconditionally, before any early return — changing hook count
  // between renders is React error #310 (see PantryList.tsx:648).
  const { supported: wakeSupported, held: wakeHeld } = useWakeLock(true);

  const ingredients = recipeIngredientList(recipe);
  const steps = recipeStepList(recipe);
  const factor = servingsFactor(base, target);
  const groups = groupSections(ingredients);

  const totalPages = steps.length + 1; // ingredients + each step
  const onIngredients = page === 0;
  const stepIndex = page - 1;
  const isLast = page === totalPages - 1;

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 flex flex-col">
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4 pb-3 border-b border-gray-100 dark:border-zinc-800"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
            {recipe.name}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {onIngredients ? "Ingredients" : `Step ${stepIndex + 1} of ${steps.length}`}
            {wakeSupported && wakeHeld && " · screen staying on"}
          </p>
        </div>
        <button
          type="button"
          onClick={onExit}
          aria-label="Exit cooking"
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 active:scale-90 transition-transform"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress */}
      <div className="flex-shrink-0 h-1 bg-gray-100 dark:bg-zinc-800">
        <motion.div
          className="h-full bg-gray-900 dark:bg-zinc-100"
          animate={{ width: `${((page + 1) / totalPages) * 100}%` }}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6">
        <AnimatePresence mode="wait" initial={false}>
          {onIngredients ? (
            <motion.div
              key="ingredients"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col gap-5 max-w-xl mx-auto"
            >
              {/* The checklist used to appear with no explanation, and ticking
                  a box did nothing — so it read as a puzzle. Name the task,
                  say what to do, and show progress so the ticks mean something. */}
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
                    Gather your ingredients
                  </h2>
                  {ingredients.length > 0 && (
                    <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {checked.size} of {ingredients.length}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {ingredients.length > 0
                    ? "Check them off as you set each one out — then start cooking."
                    : "Nothing listed for this one."}
                </p>
              </div>

              {base && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Cooking for</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button" aria-label="Fewer servings"
                      onClick={() => setTarget((t) => Math.max(1, (t ?? base) - 1))}
                      className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 flex items-center justify-center active:scale-90 transition-transform text-lg"
                    >−</button>
                    <span className="w-16 text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                      {target}
                    </span>
                    <button
                      type="button" aria-label="More servings"
                      onClick={() => setTarget((t) => Math.min(200, (t ?? base) + 1))}
                      className="w-9 h-9 rounded-xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center active:scale-90 transition-transform text-lg"
                    >+</button>
                  </div>
                </div>
              )}

              {ingredients.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  No ingredients listed — tap Start to go straight to the steps.
                </p>
              ) : (
                (() => {
                  let n = -1; // running index so checkboxes stay stable across groups
                  return groups.map((g, gi) => (
                    <div key={`${g.group ?? "_"}-${gi}`} className="flex flex-col gap-2">
                      {g.group && (
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                          {g.group}
                        </p>
                      )}
                      <ul className="flex flex-col gap-1">
                        {g.rows.map((ing) => {
                          n += 1;
                          const idx = n;
                          const on = checked.has(idx);
                          const amount = formatAmount(scaleQuantity(ing.quantity, factor, ing.unit), ing.unit);
                          return (
                            <li key={idx}>
                              <button
                                type="button"
                                onClick={() => toggle(idx)}
                                className="w-full flex items-center gap-3 py-2.5 text-left active:opacity-70"
                              >
                                <span className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                                  on
                                    ? "bg-green-500 border-green-500"
                                    : "border-gray-300 dark:border-zinc-600"
                                }`}>
                                  {on && (
                                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </span>
                                <span className={`flex-1 text-base ${on ? "text-gray-300 dark:text-zinc-600 line-through" : "text-gray-800 dark:text-gray-200"}`}>
                                  {ing.name}
                                </span>
                                {amount && (
                                  <span className={`text-sm tabular-nums flex-shrink-0 ${on ? "text-gray-300 dark:text-zinc-600" : "text-gray-500 dark:text-gray-400"}`}>
                                    {amount}
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ));
                })()
              )}

              {wakeSupported === false && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                  Your browser can&apos;t keep the screen awake. Raise your auto-lock time
                  in system settings if it sleeps while you cook.
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={`step-${stepIndex}`}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.16 }}
              className="max-w-xl mx-auto flex flex-col gap-4"
            >
              {steps[stepIndex]?.group && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {steps[stepIndex].group}
                </p>
              )}
              <p className="text-xl sm:text-2xl leading-relaxed text-gray-900 dark:text-gray-50">
                {steps[stepIndex]?.text}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer controls */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4 pt-3 border-t border-gray-100 dark:border-zinc-800"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-5 py-3.5 rounded-2xl bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 text-sm font-medium disabled:opacity-30 active:scale-[0.97] transition-all"
        >
          Back
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={() => onFinish(target)}
            disabled={finishing}
            className="flex-1 py-3.5 rounded-2xl bg-green-600 text-white text-base font-semibold disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {finishing ? "Saving…" : "Done cooking"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="flex-1 py-3.5 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-base font-semibold active:scale-[0.98] transition-all"
          >
            {onIngredients ? (steps.length > 0 ? "Start cooking" : "Continue") : "Next step"}
          </button>
        )}
      </div>
    </div>
  );
}
