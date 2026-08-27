"use client";

import Link from "next/link";
import type { HouseholdRecipe } from "@/types/database";
import { recipeIngredientList, totalMinutes, formatMinutes } from "@/lib/recipeTypes";

/**
 * A recipe tile in the library grid. Shows the hero image when there is one,
 * otherwise a calm letter tile — never a broken-image icon.
 *
 * The image is a plain <img>, deliberately NOT next/image: hero URLs can come
 * from arbitrary recipe sites and `next.config.ts` has no `images.remotePatterns`,
 * so routing them through the optimizer would mean proxying arbitrary hosts.
 * `referrerPolicy="no-referrer"` keeps the user's browsing off those sites' logs.
 */
export default function RecipeCard({
  recipe,
  householdId,
  missingCount = null,
}: {
  recipe: HouseholdRecipe;
  householdId: string;
  /** Ingredients not in the pantry. null = not evaluated (no ingredients). */
  missingCount?: number | null;
}) {
  const ingredientCount = recipeIngredientList(recipe).length;
  const time = formatMinutes(totalMinutes(recipe));
  const tags = recipe.tags ?? [];

  return (
    <Link
      href={`/household/${householdId}/recipes/${recipe.id}`}
      className="group flex flex-col rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98] transition-all"
    >
      {/* Hero / placeholder */}
      <div className="relative aspect-[4/3] bg-gray-50 dark:bg-zinc-800 overflow-hidden">
        {recipe.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.image_url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-2xl font-semibold text-gray-300 dark:text-zinc-600 select-none">
              {recipe.name.trim().charAt(0).toUpperCase() || "?"}
            </span>
          </div>
        )}
        {recipe.cook_count > 0 && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-medium tabular-nums backdrop-blur-sm">
            cooked {recipe.cook_count}×
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1 p-3">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-50 leading-snug line-clamp-2">
          {recipe.name}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
          {time && <span>{time}</span>}
          {time && ingredientCount > 0 && <span aria-hidden>·</span>}
          {ingredientCount > 0 && (
            <span>{ingredientCount} ingredient{ingredientCount === 1 ? "" : "s"}</span>
          )}
        </div>
        {/* Pantry standing — only when we actually evaluated it. */}
        {missingCount !== null && ingredientCount > 0 && (
          <span
            className={`self-start mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
              missingCount === 0
                ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
                : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400"
            }`}
          >
            {missingCount === 0 ? "Ready to cook" : `Missing ${missingCount}`}
          </span>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {tags.slice(0, 2).map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400"
              >
                {t}
              </span>
            ))}
            {tags.length > 2 && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 self-center">
                +{tags.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
