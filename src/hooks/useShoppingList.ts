"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ShoppingItem } from "@/types/database";
import { getPantryHint } from "@/lib/pantryHints";

export function useShoppingList(householdId: string, listId: string) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const selfInsertedIds = useRef<Set<string>>(new Set());

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
              if (prev.some((i) => i.id === newItem.id)) return prev;
              if (selfInsertedIds.current.has(newItem.id)) return prev;
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
    store?: string,
    assignedTo?: string[] | null,
    kind?: string
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const resolvedKind = kind ?? getPantryHint(name)?.kind ?? "food";

    const optimistic: ShoppingItem = {
      id: `temp-${Date.now()}`,
      household_id: householdId,
      list_id: listId,
      name,
      quantity: quantity ?? null,
      unit: unit ?? null,
      store: store ?? null,
      notes: null,
      completed: false,
      completed_by: null,
      completed_at: null,
      cleared_at: null,
      added_by: user?.id ?? null,
      created_at: new Date().toISOString(),
      assigned_to: assignedTo ?? null,
      kind: resolvedKind,
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
        assigned_to: assignedTo ?? null,
        kind: resolvedKind,
      })
      .select()
      .single();

    if (insertError) {
      setItems((prev) => prev.filter((i) => i.id !== optimistic.id));
    } else if (data) {
      selfInsertedIds.current.add(data.id);
      setTimeout(() => selfInsertedIds.current.delete(data.id), 5000);
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
    const snapshot = item;

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

    const { error } = await supabase
      .from("shopping_items")
      .update({
        completed,
        completed_by: completed ? user?.id : null,
        completed_at: completed ? now : null,
      })
      .eq("id", id);

    if (error) {
      console.error("shopping toggleComplete failed:", error.message);
      setItems((prev) => prev.map((i) => (i.id === id ? snapshot : i)));
    }
  }

  async function clearCompleted() {
    const now = new Date().toISOString();
    const completedItems = items.filter((i) => i.completed);
    if (!completedItems.length) return;
    const completedIds = completedItems.map((i) => i.id);

    setItems((prev) => prev.filter((i) => !i.completed));

    const { error } = await supabase
      .from("shopping_items")
      .update({ cleared_at: now })
      .in("id", completedIds);

    if (error) {
      // Restore the completed items we optimistically removed. We can't
      // perfectly preserve order without an index snapshot, but adding
      // them back at the original positions of the unaffected items is
      // close enough since clearCompleted only removes completed items.
      console.error("clearCompleted failed:", error.message);
      setItems((prev) => {
        const present = new Set(prev.map((i) => i.id));
        const restored = completedItems.filter((i) => !present.has(i.id));
        return [...prev, ...restored];
      });
    }
  }

  async function updateItem(
    id: string,
    fields: Partial<Pick<ShoppingItem, "name" | "quantity" | "unit" | "store" | "assigned_to">>
  ) {
    const prev = items.find((i) => i.id === id);
    setItems((all) => all.map((i) => (i.id === id ? { ...i, ...fields } : i)));
    const { error } = await supabase.from("shopping_items").update(fields).eq("id", id);
    if (error) {
      console.error("shopping updateItem failed:", error.message);
      if (prev) setItems((all) => all.map((i) => (i.id === id ? prev : i)));
    }
  }

  async function deleteItem(id: string) {
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const snapshot = items[idx];
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error } = await supabase.from("shopping_items").delete().eq("id", id);
    if (error) {
      console.error("shopping deleteItem failed:", error.message);
      setItems((prev) => {
        if (prev.some((i) => i.id === id)) return prev;
        const next = [...prev];
        next.splice(Math.min(idx, next.length), 0, snapshot);
        return next;
      });
    }
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
    updateItem,
    toggleComplete,
    clearCompleted,
    deleteItem,
  };
}
