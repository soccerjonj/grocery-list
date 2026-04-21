"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PantryItem } from "@/types/database";

export interface AddPantryOptions {
  expiresAt?: string | null;
  storageLocation?: string | null;
  fridgeZone?: string | null;
  foodCategory?: string | null;
  assignedTo?: string[] | null;
}

export function usePantry(householdId: string) {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  // Tracks IDs we inserted ourselves so Realtime doesn't double-add them
  const selfInsertedIds = useRef<Set<string>>(new Set());

  const fetchItems = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("pantry_items")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setItems(data ?? []);
    }
    setLoading(false);
  }, [householdId, supabase]);

  useEffect(() => {
    fetchItems();

    const channel = supabase
      .channel(`pantry-${householdId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pantry_items",
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newItem = payload.new as PantryItem;
            setItems((prev) => {
              // Skip if already present (exact match) or if we inserted it ourselves
              if (prev.some((i) => i.id === newItem.id)) return prev;
              if (selfInsertedIds.current.has(newItem.id)) return prev;
              return [newItem, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as PantryItem;
            setItems((prev) =>
              prev.map((i) => (i.id === updated.id ? updated : i))
            );
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as { id: string };
            setItems((prev) => prev.filter((i) => i.id !== deleted.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, fetchItems, supabase]);

  async function addItem(
    name: string,
    quantity: number,
    unit?: string,
    options?: AddPantryOptions
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const optimistic: PantryItem = {
      id: `temp-${Date.now()}`,
      household_id: householdId,
      name,
      quantity,
      unit: unit ?? null,
      notes: null,
      added_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      expires_at: options?.expiresAt ?? null,
      storage_location: options?.storageLocation ?? null,
      fridge_zone: options?.fridgeZone ?? null,
      food_category: options?.foodCategory ?? null,
      assigned_to: options?.assignedTo ?? null,
      running_low: false,
      opened: false,
    };

    setItems((prev) => [optimistic, ...prev]);

    const { data, error: insertError } = await supabase
      .from("pantry_items")
      .insert({
        household_id: householdId,
        name,
        quantity,
        unit: unit ?? null,
        added_by: user?.id ?? null,
        expires_at: options?.expiresAt ?? null,
        storage_location: options?.storageLocation ?? null,
        fridge_zone: options?.fridgeZone ?? null,
        food_category: options?.foodCategory ?? null,
        assigned_to: options?.assignedTo ?? null,
      })
      .select()
      .single();

    if (insertError) {
      setItems((prev) => prev.filter((i) => i.id !== optimistic.id));
    } else if (data) {
      selfInsertedIds.current.add(data.id);
      setTimeout(() => selfInsertedIds.current.delete(data.id), 5000);
      setItems((prev) => {
        // Strip any Realtime-added copy of the real item (race condition: Realtime
        // INSERT event can arrive before this response and add a duplicate)
        const deduped = prev.filter((i) => i.id !== data.id);
        return deduped.map((i) => (i.id === optimistic.id ? data : i));
      });
    }
  }

  async function updateQuantity(id: string, quantity: number) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, quantity, updated_at: new Date().toISOString() } : i
      )
    );
    await supabase
      .from("pantry_items")
      .update({ quantity, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  async function updateItem(
    id: string,
    fields: Partial<Omit<PantryItem, "id" | "household_id" | "created_at" | "added_by">>
  ) {
    const now = new Date().toISOString();
    // Snapshot for rollback
    const prev = items.find((i) => i.id === id);
    setItems((all) =>
      all.map((i) => (i.id === id ? { ...i, ...fields, updated_at: now } : i))
    );
    const { error } = await supabase
      .from("pantry_items")
      .update({ ...fields, updated_at: now })
      .eq("id", id);
    if (error) {
      console.error("pantry updateItem failed:", error.message);
      // Roll back optimistic update
      if (prev) setItems((all) => all.map((i) => (i.id === id ? prev : i)));
    }
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("pantry_items").delete().eq("id", id);
  }

  return { items, loading, error, addItem, updateQuantity, updateItem, deleteItem };
}
