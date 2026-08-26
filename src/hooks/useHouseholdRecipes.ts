"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HouseholdRecipe } from "@/types/database";
import type { ExtractedIngredient } from "@/lib/recipeExtract";
import type { RecipeIngredient, RecipeStep } from "@/lib/recipeTypes";
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

/**
 * Everything a recipe can carry. Only `name` + `ingredients` are required so
 * the original shopping-import path keeps working unchanged; the cooking
 * fields (migration 028) are all optional.
 */
export interface RecipeInput {
  name: string;
  ingredients: RecipeIngredient[];
  steps?: RecipeStep[];
  servings?: number | null;
  servingsUnit?: string | null;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  imageUrl?: string | null;
  imagePath?: string | null;
  notes?: string | null;
  description?: string | null;
  tags?: string[];
  sourceUrl?: string | null;
  sourceKind?: "url" | "photo" | "manual" | "text";
}

/** Fields an existing recipe can be patched with. */
export type RecipePatch = Partial<Omit<RecipeInput, "sourceKind">>;

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

    // Refetch on reconnect, skip the initial subscribe (see useShoppingFlow).
    let hasSubscribed = false;

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
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[realtime] recipes channel ${status}`);
        } else if (status === "SUBSCRIBED") {
          if (hasSubscribed) fetchRecipes();
          hasSubscribed = true;
        }
      });

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
        steps: (input.steps ?? []) as unknown as never,
        servings: input.servings ?? null,
        servings_unit: input.servingsUnit ?? null,
        prep_minutes: input.prepMinutes ?? null,
        cook_minutes: input.cookMinutes ?? null,
        // Same http(s)-only guard as source_url — an image_url is rendered
        // straight into an <img src>, so never let a javascript:/data: URI in.
        image_url: safeHttpUrl(input.imageUrl) ?? null,
        image_path: input.imagePath ?? null,
        notes: input.notes ?? null,
        description: input.description ?? null,
        tags: input.tags ?? [],
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

  /** Patch any editable field of an existing recipe. Optimistic w/ rollback. */
  async function updateRecipe(id: string, patch: RecipePatch): Promise<boolean> {
    const snapshot = recipes.find((r) => r.id === id);
    if (!snapshot) return false;

    const optimistic: HouseholdRecipe = {
      ...snapshot,
      name: patch.name ?? snapshot.name,
      ingredients: (patch.ingredients ?? snapshot.ingredients) as unknown as HouseholdRecipe["ingredients"],
      steps: (patch.steps ?? snapshot.steps) as unknown as HouseholdRecipe["steps"],
      servings: patch.servings !== undefined ? patch.servings : snapshot.servings,
      servings_unit: patch.servingsUnit !== undefined ? patch.servingsUnit : snapshot.servings_unit,
      prep_minutes: patch.prepMinutes !== undefined ? patch.prepMinutes : snapshot.prep_minutes,
      cook_minutes: patch.cookMinutes !== undefined ? patch.cookMinutes : snapshot.cook_minutes,
      image_url: patch.imageUrl !== undefined ? (safeHttpUrl(patch.imageUrl) ?? null) : snapshot.image_url,
      image_path: patch.imagePath !== undefined ? patch.imagePath : snapshot.image_path,
      notes: patch.notes !== undefined ? patch.notes : snapshot.notes,
      description: patch.description !== undefined ? patch.description : snapshot.description,
      tags: patch.tags !== undefined ? patch.tags : snapshot.tags,
      source_url: patch.sourceUrl !== undefined ? (safeHttpUrl(patch.sourceUrl) ?? null) : snapshot.source_url,
      updated_at: new Date().toISOString(),
    };
    setRecipes((prev) => prev.map((r) => (r.id === id ? optimistic : r)));

    const updates: Record<string, unknown> = {};
    if (patch.name !== undefined)        updates.name = patch.name.trim();
    if (patch.ingredients !== undefined) updates.ingredients = patch.ingredients;
    if (patch.steps !== undefined)       updates.steps = patch.steps;
    if (patch.servings !== undefined)     updates.servings = patch.servings;
    if (patch.servingsUnit !== undefined) updates.servings_unit = patch.servingsUnit;
    if (patch.prepMinutes !== undefined)  updates.prep_minutes = patch.prepMinutes;
    if (patch.cookMinutes !== undefined)  updates.cook_minutes = patch.cookMinutes;
    if (patch.imageUrl !== undefined)     updates.image_url = safeHttpUrl(patch.imageUrl) ?? null;
    if (patch.imagePath !== undefined)    updates.image_path = patch.imagePath;
    if (patch.notes !== undefined)        updates.notes = patch.notes;
    if (patch.description !== undefined)  updates.description = patch.description;
    if (patch.tags !== undefined)         updates.tags = patch.tags;
    if (patch.sourceUrl !== undefined)   updates.source_url = safeHttpUrl(patch.sourceUrl) ?? null;

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

  return { recipes, loading, loadError, refetch: fetchRecipes, saveRecipe, updateRecipe, deleteRecipe };
}

/** Convenience helper: cast the JSONB column to the typed ingredient list. */
export function recipeIngredients(recipe: HouseholdRecipe): ExtractedIngredient[] {
  if (!Array.isArray(recipe.ingredients)) return [];
  return recipe.ingredients as unknown as ExtractedIngredient[];
}
