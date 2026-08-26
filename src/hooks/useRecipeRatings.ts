"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RecipeRating } from "@/types/database";

/**
 * Per-person recipe ratings for the household. Everyone sees everyone's
 * (RLS allows household-wide SELECT), but you can only write your own —
 * enforced by the split policies in migration 028, not just here.
 *
 * Mounted by the recipes routes rather than HouseholdDataContext: ratings are
 * only needed on this tab, and the household context already carries five
 * subscriptions.
 */
export function useRecipeRatings(householdId: string) {
  const [ratings, setRatings] = useState<RecipeRating[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const supabase = createClient();
  // Unique channel per instance so two consumers never collide on one topic
  // (same guard as useActivityLog / useHouseholdTaxonomy).
  const chanId = useRef<string>("");
  if (!chanId.current) chanId.current = Math.random().toString(36).slice(2);

  const fetchRatings = useCallback(async () => {
    const { data } = await supabase
      .from("recipe_ratings")
      .select("*")
      .eq("household_id", householdId);
    setRatings(data ?? []);
  }, [householdId, supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null));
  }, [supabase]);

  useEffect(() => {
    if (!householdId) return;
    fetchRatings();
    const channel = supabase
      .channel(`recipe-ratings-${householdId}-${chanId.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recipe_ratings", filter: `household_id=eq.${householdId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { recipe_id: string; user_id: string };
            setRatings((prev) =>
              prev.filter((r) => !(r.recipe_id === old.recipe_id && r.user_id === old.user_id)),
            );
            return;
          }
          const row = payload.new as RecipeRating;
          setRatings((prev) => {
            const rest = prev.filter(
              (r) => !(r.recipe_id === row.recipe_id && r.user_id === row.user_id),
            );
            return [...rest, row];
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [householdId, fetchRatings, supabase]);

  /** Everyone's ratings for one recipe. */
  const forRecipe = useCallback(
    (recipeId: string) => ratings.filter((r) => r.recipe_id === recipeId),
    [ratings],
  );

  /** The signed-in user's rating for a recipe, or null. */
  const myRating = useCallback(
    (recipeId: string) =>
      ratings.find((r) => r.recipe_id === recipeId && r.user_id === currentUserId)?.rating ?? null,
    [ratings, currentUserId],
  );

  /** Set (or clear, with null) your own rating. Optimistic. */
  async function setMyRating(recipeId: string, rating: number | null): Promise<void> {
    if (!currentUserId) return;
    const prev = ratings;

    if (rating === null) {
      setRatings((p) => p.filter((r) => !(r.recipe_id === recipeId && r.user_id === currentUserId)));
      const { error } = await supabase
        .from("recipe_ratings")
        .delete()
        .eq("recipe_id", recipeId)
        .eq("user_id", currentUserId);
      if (error) { console.error("clear rating failed:", error.message); setRatings(prev); }
      return;
    }

    const now = new Date().toISOString();
    setRatings((p) => {
      const rest = p.filter((r) => !(r.recipe_id === recipeId && r.user_id === currentUserId));
      return [...rest, {
        recipe_id: recipeId, user_id: currentUserId, household_id: householdId,
        rating, note: null, created_at: now, updated_at: now,
      }];
    });

    const { error } = await supabase
      .from("recipe_ratings")
      .upsert(
        { recipe_id: recipeId, user_id: currentUserId, household_id: householdId, rating },
        { onConflict: "recipe_id,user_id" },
      );
    if (error) { console.error("setMyRating failed:", error.message); setRatings(prev); }
  }

  return { ratings, currentUserId, forRecipe, myRating, setMyRating, refetch: fetchRatings };
}
