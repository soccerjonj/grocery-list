"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HouseholdRecipe } from "@/types/database";
import type { ExtractedIngredient } from "@/lib/recipeExtract";
import { safeHttpUrl } from "@/lib/utils";

/**
 * Saved recipes for the household. Backed by the `household_recipes` table
 * (migration 021). Shared across all household members via RLS — same
 * pattern as the pantry/shopping data.
 *
 * Ingredients are stored as JSONB matching ExtractedIngredient shape, so
 * the existing recipe-extraction + ingredient-review code can read/write
 * without any conversion.
 */

export interface RecipeInput {
  name: string;
  ingredients: ExtractedIngredient[];
  sourceUrl?: string | null;
  sourceKind?: "url" | "photo" | "manual";
}

export function useHouseholdRecipes(householdId: string) {
  const [recipes, setRecipes] = useState<HouseholdRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const supabase = createClient();
  // Track our own inserts so realtime doesn't duplicate them.
  const selfInsertedIds = useRef<Set<string>>(new Set());

  const fetchRecipes = useCallback(async () => {
    const { data, error } = await supabase
      .from("household_recipes")
      .select("*")
      .eq("household_id", householdId)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("fetchRecipes failed:", error.message);
      setLoadError(error.message);
    } else {
      setRecipes(data ?? []);
      setLoadError(null);
    }
    setLoading(false);
  }, [householdId, supabase]);

  useEffect(() => {
    if (!householdId) return;
    fetchRecipes();

    const channel = supabase
      .channel(`household-recipes-${householdId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "household_recipes", filter: `household_id=eq.${householdId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as HouseholdRecipe;
            setRecipes((prev) => {
              if (prev.some((r) => r.id === row.id)) return prev;
              if (selfInsertedIds.current.has(row.id)) return prev;
              return [row, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as HouseholdRecipe;
            setRecipes((prev) => prev.map((r) => (r.id === row.id ? row : r)));
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as { id: string };
            setRecipes((prev) => prev.filter((r) => r.id !== row.id));
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [householdId, fetchRecipes, supabase]);

  /** Save a new recipe. Returns the inserted row's id on success. */
  async function saveRecipe(input: RecipeInput): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("household_recipes")
      .insert({
        household_id: householdId,
        name: input.name.trim(),
        // Cast since the JSONB column is typed as Json in our generated types.
        ingredients: input.ingredients as unknown as never,
        // Only persist safe http(s) URLs — never a javascript:/data: URI that
        // would execute when rendered as a "View source" link.
        source_url: safeHttpUrl(input.sourceUrl) ?? null,
        source_kind: input.sourceKind ?? "manual",
        added_by: user?.id ?? null,
      })
      .select()
      .single();
    if (error || !data) {
      console.error("saveRecipe failed:", error?.message);
      return null;
    }
    selfInsertedIds.current.add(data.id);
    setTimeout(() => selfInsertedIds.current.delete(data.id), 5000);
    setRecipes((prev) => (prev.some((r) => r.id === data.id) ? prev : [data, ...prev]));
    return data.id;
  }

  /** Update name / ingredients of an existing recipe. */
  async function updateRecipe(
    id: string,
    patch: { name?: string; ingredients?: ExtractedIngredient[] },
  ): Promise<boolean> {
    // Optimistic update with rollback
    const snapshot = recipes.find((r) => r.id === id);
    if (!snapshot) return false;
    const optimistic: HouseholdRecipe = {
      ...snapshot,
      name: patch.name ?? snapshot.name,
      ingredients: (patch.ingredients ?? snapshot.ingredients) as unknown as HouseholdRecipe["ingredients"],
      updated_at: new Date().toISOString(),
    };
    setRecipes((prev) => prev.map((r) => (r.id === id ? optimistic : r)));

    const updates: Record<string, unknown> = {};
    if (patch.name !== undefined) updates.name = patch.name.trim();
    if (patch.ingredients !== undefined) updates.ingredients = patch.ingredients;

    const { error } = await supabase
      .from("household_recipes")
      .update(updates as never)
      .eq("id", id);
    if (error) {
      console.error("updateRecipe failed:", error.message);
      setRecipes((prev) => prev.map((r) => (r.id === id ? snapshot : r)));
      return false;
    }
    return true;
  }

  /** Delete a saved recipe. */
  async function deleteRecipe(id: string): Promise<boolean> {
    const snapshot = recipes.find((r) => r.id === id);
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    const { error } = await supabase.from("household_recipes").delete().eq("id", id);
    if (error) {
      console.error("deleteRecipe failed:", error.message);
      if (snapshot) setRecipes((prev) => (prev.some((r) => r.id === id) ? prev : [snapshot, ...prev]));
      return false;
    }
    return true;
  }

  return { recipes, loading, loadError, saveRecipe, updateRecipe, deleteRecipe };
}

/** Convenience helper: cast the JSONB column to the typed ingredient list. */
export function recipeIngredients(recipe: HouseholdRecipe): ExtractedIngredient[] {
  if (!Array.isArray(recipe.ingredients)) return [];
  return recipe.ingredients as unknown as ExtractedIngredient[];
}
