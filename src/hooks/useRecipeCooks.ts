"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RecipeCook } from "@/types/database";

/**
 * Cook history for one recipe — the read path for the durations recorded in
 * migration 031. Fetched per recipe rather than lifted into
 * HouseholdDataContext: history is only wanted on a recipe page, and the
 * context already carries five realtime subscriptions.
 *
 * No realtime here on purpose. A cook you just finished is already reflected
 * by the recipe row's cook_count/last_cooked_at (kept current by the DB
 * trigger, which does arrive over realtime); this list is history, and
 * refetching on mount is enough.
 */
export function useRecipeCooks(recipeId: string, limit = 10) {
  const [cooks, setCooks] = useState<RecipeCook[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchCooks = useCallback(async () => {
    const { data } = await supabase
      .from("recipe_cooks")
      .select("*")
      .eq("recipe_id", recipeId)
      .order("cooked_at", { ascending: false })
      .limit(limit);
    setCooks(data ?? []);
    setLoading(false);
  }, [recipeId, limit, supabase]);

  useEffect(() => {
    if (!recipeId) return;
    fetchCooks();
  }, [recipeId, fetchCooks]);

  return { cooks, loading, refetch: fetchCooks };
}

/**
 * Typical duration across recorded cooks, using the MEDIAN rather than the
 * mean — one cook where you wandered off for an hour shouldn't define
 * "usually". Returns null until there's at least one timed cook.
 */
export function typicalDuration(cooks: RecipeCook[]): {
  total: number; prep: number | null; cook: number | null; samples: number;
} | null {
  const timed = cooks.filter((c) => typeof c.total_seconds === "number" && c.total_seconds! > 0);
  if (timed.length === 0) return null;

  const median = (xs: number[]) => {
    if (xs.length === 0) return null;
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  };

  const total = median(timed.map((c) => c.total_seconds!))!;
  // Only cooks that actually split their phases inform the prep/cook figures.
  const split = timed.filter((c) => typeof c.prep_seconds === "number" && typeof c.cook_seconds === "number");
  return {
    total,
    prep: median(split.map((c) => c.prep_seconds!)),
    cook: median(split.map((c) => c.cook_seconds!)),
    samples: timed.length,
  };
}
