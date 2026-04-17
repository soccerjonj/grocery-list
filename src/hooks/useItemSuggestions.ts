"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface ItemSuggestion {
  name: string;
  source: "pantry" | "shopping";
  // Pantry metadata (for pre-filling the pantry add form)
  food_category?: string | null;
  storage_location?: string | null;
  fridge_zone?: string | null;
  unit?: string | null;
  // Shopping metadata
  store?: string | null;
}

export function useItemSuggestions(householdId: string) {
  const [suggestions, setSuggestions] = useState<ItemSuggestion[]>([]);

  useEffect(() => {
    if (!householdId) return;
    const supabase = createClient();

    Promise.all([
      supabase
        .from("pantry_items")
        .select("name, food_category, storage_location, fridge_zone, unit")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("shopping_items")
        .select("name, store, unit")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]).then(([pantryResult, shoppingResult]) => {
      const seen = new Set<string>();
      const all: ItemSuggestion[] = [];

      // Pantry items carry more metadata — prioritise them
      for (const item of pantryResult.data ?? []) {
        const key = item.name.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        all.push({
          name: item.name.trim(),
          source: "pantry",
          food_category: item.food_category,
          storage_location: item.storage_location,
          fridge_zone: item.fridge_zone,
          unit: item.unit,
        });
      }

      // Shopping items fill in any names not already seen
      for (const item of shoppingResult.data ?? []) {
        const key = item.name.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        all.push({
          name: item.name.trim(),
          source: "shopping",
          store: item.store,
          unit: item.unit,
        });
      }

      setSuggestions(all);
    });
  }, [householdId]);

  /** Filter suggestions to those matching the current query (case-insensitive). */
  function getSuggestions(query: string, limit = 6): ItemSuggestion[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return suggestions
      .filter((s) => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q)
      .slice(0, limit);
  }

  return { suggestions, getSuggestions };
}
