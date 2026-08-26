"use client";

import { useState } from "react";
import type { HouseholdRecipe } from "@/types/database";
import {
  recipeIngredientList, recipeStepList, groupSections,
  totalMinutes, formatMinutes, formatRelativeDay,
} from "@/lib/recipeTypes";
import { scaleQuantity, formatAmount, servingsFactor } from "@/lib/recipeScale";
import { safeHttpUrl } from "@/lib/utils";

/**
 * The readable recipe page: hero, meta, scalable ingredients, steps, notes.
 *
 * Scaling is view-only state here — changing servings never writes to the
 * recipe. Adding to the shopping list asks for servings separately (that
 * sheet owns its own count), so "what I'm reading" and "what I'm buying"
 * can't silently disagree.
 */
export default function RecipeView({
  recipe,
  onAddToList,
}: {
  recipe: HouseholdRecipe;
  onAddToList: () => void;
}) {
  const base = recipe.servings ?? null;
  const [target, setTarget] = useState<number | null>(base);
  const factor = servingsFactor(base, target);

  const ingredients = recipeIngredientList(recipe);
  const steps = recipeStepList(recipe);
  const ingredientGroups = groupSections(ingredients);
  const stepGroups = groupSections(steps);
  const time = formatMinutes(totalMinutes(recipe));
  const sourceUrl = safeHttpUrl(recipe.source_url);

  // Only offer scaling when we know what the amounts are relative to —
  // scaling against an unknown base would be a lie.
  const canScale = !!base && base > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      {recipe.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={recipe.image_url}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full aspect-[16/9] object-cover rounded-2xl border border-gray-100 dark:border-zinc-800"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      )}

      {/* Meta row */}
      {(time || recipe.servings || recipe.cook_count > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          {time && (
            <span className="inline-flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
              </svg>
              {time}
            </span>
          )}
          {recipe.servings && (
            <span className="inline-flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5V4H2v16h5m10 0v-6H7v6m10 0H7" />
              </svg>
              Serves {recipe.servings}{recipe.servings_unit ? ` ${recipe.servings_unit}` : ""}
            </span>
          )}
          {recipe.cook_count > 0 && (
            <span>
              Cooked {recipe.cook_count}×
              {formatRelativeDay(recipe.last_cooked_at) && ` · last ${formatRelativeDay(recipe.last_cooked_at)}`}
            </span>
          )}
        </div>
      )}

      {recipe.description && (
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{recipe.description}</p>
      )}

      {/* Ingredients */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Ingredients</h2>
          {canScale && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Fewer servings"
                onClick={() => setTarget((t) => Math.max(1, (t ?? base!) - 1))}
                className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 flex items-center justify-center active:scale-90 transition-transform"
              >−</button>
              <span className="text-xs tabular-nums text-gray-600 dark:text-gray-300 min-w-[4.5rem] text-center">
                {target} serving{target === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                aria-label="More servings"
                onClick={() => setTarget((t) => Math.min(200, (t ?? base!) + 1))}
                className="w-7 h-7 rounded-lg bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center active:scale-90 transition-transform"
              >+</button>
            </div>
          )}
        </div>

        {ingredients.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No ingredients yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {ingredientGroups.map((g, gi) => (
              <div key={`${g.group ?? "_"}-${gi}`} className="flex flex-col gap-1.5">
                {g.group && (
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {g.group}
                  </p>
                )}
                <ul className="flex flex-col divide-y divide-gray-50 dark:divide-zinc-800 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3">
                  {g.rows.map((ing, i) => {
                    const qty = scaleQuantity(ing.quantity, factor, ing.unit);
                    const amount = formatAmount(qty, ing.unit);
                    return (
                      <li key={`${ing.name}-${i}`} className="flex items-baseline gap-3 py-2.5">
                        <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{ing.name}</span>
                        {amount && (
                          <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 flex-shrink-0">
                            {amount}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onAddToList}
          disabled={ingredients.length === 0}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-40 transition-colors active:scale-[0.98]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h2l1 9h12l1.5-6H7M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zM18 19.5a.5.5 0 11-1 0 .5.5 0 011 0z" />
          </svg>
          Add ingredients to shopping list
        </button>
      </section>

      {/* Steps */}
      {steps.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Steps</h2>
          <div className="flex flex-col gap-4">
            {stepGroups.map((g, gi) => {
              // Number continuously across sections so "step 7" means step 7.
              const offset = stepGroups.slice(0, gi).reduce((n, s) => n + s.rows.length, 0);
              return (
                <div key={`${g.group ?? "_"}-${gi}`} className="flex flex-col gap-2">
                  {g.group && (
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {g.group}
                    </p>
                  )}
                  <ol className="flex flex-col gap-3">
                    {g.rows.map((s, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 text-xs font-semibold flex items-center justify-center tabular-nums">
                          {offset + i + 1}
                        </span>
                        <p className="flex-1 text-sm text-gray-700 dark:text-gray-300 leading-relaxed pt-0.5">
                          {s.text}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Notes */}
      {recipe.notes && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Notes</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
            {recipe.notes}
          </p>
        </section>
      )}

      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors self-start"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
          </svg>
          View original source
        </a>
      )}
    </div>
  );
}
