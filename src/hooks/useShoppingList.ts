"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ShoppingItem } from "@/types/database";

export function useShoppingList(householdId: string, listId: string) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchItems = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("shopping_items")
      .select("*")
      .eq("household_id", householdId)
      .eq("list_id", listId)
      .is("cleared_at", null)
      .order("created_at", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setItems(data ?? []);
    }
    setLoading(false);
  }, [householdId, listId, supabase]);

  useEffect(() => {
    if (!listId) {
      setItems([]);
      setLoading(false);
      return;
    }

    fetchItems();

    const channel = supabase
      .channel(`shopping-${listId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shopping_items",
          filter: `list_id=eq.${listId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newItem = payload.new as ShoppingItem;
            if (newItem.cleared_at) return;
            setItems((prev) => {
              if (prev.find((i) => i.id === newItem.id)) return prev;
              return [...prev, newItem];
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as ShoppingItem;
            if (updated.cleared_at) {
              setItems((prev) => prev.filter((i) => i.id !== updated.id));
            } else {
              setItems((prev) =>
                prev.map((i) => (i.id === updated.id ? updated : i))
              );
            }
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
  }, [householdId, listId, fetchItems, supabase]);

  async function addItem(
    name: string,
    quantity?: number,
    unit?: string,
    store?: string
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const optimistic: ShoppingItem = {
      id: `temp-${Date.now()}`,
      household_id: householdId,
      list_id: listId,
      name,
      quantity: quantity ?? null,
      unit: unit ?? null,
      store: store ?? null,
      completed: false,
      completed_by: null,
      completed_at: null,
      cleared_at: null,
      added_by: user?.id ?? null,
      created_at: new Date().toISOString(),
    };

    setItems((prev) => [...prev, optimistic]);

    const { data, error: insertError } = await supabase
      .from("shopping_items")
      .insert({
        household_id: householdId,
        list_id: listId,
        name,
        quantity: quantity ?? null,
        unit: unit ?? null,
        store: store ?? null,
        added_by: user?.id ?? null,
      })
      .select()
      .single();

    if (insertError) {
      setItems((prev) => prev.filter((i) => i.id !== optimistic.id));
    } else if (data) {
      setItems((prev) =>
        prev.map((i) => (i.id === optimistic.id ? data : i))
      );
    }
  }

  async function toggleComplete(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const now = new Date().toISOString();
    const completed = !item.completed;

    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              completed,
              completed_by: completed ? (user?.id ?? null) : null,
              completed_at: completed ? now : null,
            }
          : i
      )
    );

    await supabase
      .from("shopping_items")
      .update({
        completed,
        completed_by: completed ? user?.id : null,
        completed_at: completed ? now : null,
      })
      .eq("id", id);
  }

  async function clearCompleted() {
    const now = new Date().toISOString();
    const completedIds = items.filter((i) => i.completed).map((i) => i.id);
    if (!completedIds.length) return;

    setItems((prev) => prev.filter((i) => !i.completed));

    await supabase
      .from("shopping_items")
      .update({ cleared_at: now })
      .in("id", completedIds);
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("shopping_items").delete().eq("id", id);
  }

  const activeItems = items.filter((i) => !i.completed);
  const completedItems = items.filter((i) => i.completed);

  return {
    items,
    activeItems,
    completedItems,
    loading,
    error,
    addItem,
    toggleComplete,
    clearCompleted,
    deleteItem,
  };
}
