"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HouseholdTaxonomy } from "@/types/database";

/**
 * Household-defined custom categories + storage locations (migration 027).
 * Mounted once in HouseholdDataProvider and shared, so there's a single
 * fetch + realtime subscription. Entries carry a `label` that is stored
 * verbatim in pantry_items.food_category / storage_location.
 */
export type TaxonomyType = "category" | "location";

export function useHouseholdTaxonomy(householdId: string) {
  const [entries, setEntries] = useState<HouseholdTaxonomy[]>([]);
  const supabase = createClient();
  const selfInserted = useRef<Set<string>>(new Set());
  // Unique channel per instance so multiple consumers never collide on the
  // same postgres_changes topic (see useActivityLog for the same guard).
  const chanId = useRef<string>("");
  if (!chanId.current) chanId.current = Math.random().toString(36).slice(2);

  const fetchEntries = useCallback(async () => {
    const { data } = await supabase
      .from("household_taxonomy")
      .select("*")
      .eq("household_id", householdId)
      .order("label", { ascending: true });
    setEntries(data ?? []);
  }, [householdId, supabase]);

  useEffect(() => {
    if (!householdId) return;
    fetchEntries();
    const channel = supabase
      .channel(`taxonomy-${householdId}-${chanId.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "household_taxonomy", filter: `household_id=eq.${householdId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as HouseholdTaxonomy;
            setEntries((prev) => (prev.some((e) => e.id === row.id) || selfInserted.current.has(row.id)) ? prev : [...prev, row]);
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as { id: string };
            setEntries((prev) => prev.filter((e) => e.id !== row.id));
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as HouseholdTaxonomy;
            setEntries((prev) => prev.map((e) => (e.id === row.id ? row : e)));
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [householdId, fetchEntries, supabase]);

  /** Custom labels of a given type for a given kind (food/supplies). */
  const listFor = useCallback(
    (type: TaxonomyType, kind: string) =>
      entries.filter((e) => e.type === type && e.kind === kind).map((e) => e.label),
    [entries],
  );

  /** Add a custom entry; returns its label (or null on failure). Idempotent-ish. */
  async function add(type: TaxonomyType, kind: string, rawLabel: string): Promise<string | null> {
    const label = rawLabel.trim();
    if (!label) return null;
    // Already exists (case-insensitive)? Just return it.
    const existing = entries.find((e) => e.type === type && e.kind === kind && e.label.toLowerCase() === label.toLowerCase());
    if (existing) return existing.label;

    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("household_taxonomy")
      .insert({ household_id: householdId, type, kind, label, added_by: user?.id ?? null })
      .select()
      .single();
    if (error || !data) return null;
    selfInserted.current.add(data.id);
    setTimeout(() => selfInserted.current.delete(data.id), 5000);
    setEntries((prev) => (prev.some((e) => e.id === data.id) ? prev : [...prev, data]));
    return data.label;
  }

  /** Remove a custom entry by (type, kind, label). Optimistic. */
  async function remove(type: TaxonomyType, kind: string, label: string): Promise<void> {
    const target = entries.find((e) => e.type === type && e.kind === kind && e.label === label);
    if (!target) return;
    setEntries((prev) => prev.filter((e) => e.id !== target.id));
    const { error } = await supabase.from("household_taxonomy").delete().eq("id", target.id);
    if (error) setEntries((prev) => (prev.some((e) => e.id === target.id) ? prev : [...prev, target]));
  }

  return { entries, listFor, add, remove };
}
