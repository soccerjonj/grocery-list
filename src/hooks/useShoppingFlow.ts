"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ShoppingItem, ShoppingList } from "@/types/database";

function tripName() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function useShoppingFlow(householdId: string) {
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [pastLists, setPastLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const selfInsertedIds = useRef<Set<string>>(new Set());
  const supabase = createClient();

  // ── Bootstrap: find or create the active list ─────────────────
  const init = useCallback(async () => {
    setLoading(true);

    // Find active list
    const { data: active } = await supabase
      .from("shopping_lists")
      .select("id")
      .eq("household_id", householdId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let listId = active?.id ?? null;

    if (!listId) {
      const { data: created } = await supabase
        .from("shopping_lists")
        .insert({ household_id: householdId, name: "current" })
        .select("id")
        .single();
      listId = created?.id ?? null;
    }

    setActiveListId(listId);

    if (listId) {
      const { data: itemData } = await supabase
        .from("shopping_items")
        .select("*")
        .eq("list_id", listId)
        .is("cleared_at", null)
        .order("created_at", { ascending: true });
      setItems(itemData ?? []);
    }

    // Fetch past trips
    const { data: past } = await supabase
      .from("shopping_lists")
      .select("*")
      .eq("household_id", householdId)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(10);
    setPastLists(past ?? []);

    setLoading(false);
  }, [householdId, supabase]);

  useEffect(() => {
    if (!householdId) return;
    init();
  }, [householdId, init]);

  // ── Realtime subscription on the active list ──────────────────
  useEffect(() => {
    if (!activeListId) return;

    const channel = supabase
      .channel(`shopping-flow-${activeListId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_items", filter: `list_id=eq.${activeListId}` },
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
              setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
            }
          } else if (payload.eventType === "DELETE") {
            setItems((prev) => prev.filter((i) => i.id !== (payload.old as { id: string }).id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeListId, supabase]);

  // ── Item actions ──────────────────────────────────────────────
  async function addItem(
    name: string,
    quantity?: number,
    unit?: string,
    store?: string,
    assignedTo?: string[] | null
  ) {
    if (!activeListId) return;
    const { data: { user } } = await supabase.auth.getUser();

    const optimistic: ShoppingItem = {
      id: `temp-${Date.now()}`,
      household_id: householdId,
      list_id: activeListId,
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
      assigned_to: assignedTo ?? null,
    };

    setItems((prev) => [...prev, optimistic]);

    const { data, error } = await supabase
      .from("shopping_items")
      .insert({
        household_id: householdId,
        list_id: activeListId,
        name,
        quantity: quantity ?? null,
        unit: unit ?? null,
        store: store ?? null,
        added_by: user?.id ?? null,
        assigned_to: assignedTo ?? null,
      })
      .select()
      .single();

    if (error) {
      setItems((prev) => prev.filter((i) => i.id !== optimistic.id));
    } else if (data) {
      selfInsertedIds.current.add(data.id);
      setTimeout(() => selfInsertedIds.current.delete(data.id), 5000);
      setItems((prev) => {
        const deduped = prev.filter((i) => i.id !== data.id);
        return deduped.map((i) => (i.id === optimistic.id ? data : i));
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

  async function toggleComplete(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const completed = !item.completed;

    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, completed, completed_by: completed ? (user?.id ?? null) : null, completed_at: completed ? now : null }
          : i
      )
    );

    await supabase.from("shopping_items").update({
      completed,
      completed_by: completed ? user?.id : null,
      completed_at: completed ? now : null,
    }).eq("id", id);
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("shopping_items").delete().eq("id", id);
  }

  // ── Finish trip ───────────────────────────────────────────────
  // Archives current list (saves it as a past trip), creates a new active
  // list, and carries over any unchecked items.
  // Returns the archived list ID so the caller can offer pantry import.
  async function finishTrip(): Promise<string | null> {
    if (!activeListId || finishing) return null;
    setFinishing(true);
    const archivedListId = activeListId;

    const now = new Date().toISOString();
    const unchecked = items.filter((i) => !i.completed);

    // Name and archive the current list
    await supabase
      .from("shopping_lists")
      .update({ archived_at: now, name: tripName() })
      .eq("id", activeListId);

    // Create new active list
    const { data: newList } = await supabase
      .from("shopping_lists")
      .insert({ household_id: householdId, name: "current" })
      .select()
      .single();

    if (!newList) { setFinishing(false); return null; }

    // Move unchecked items to the new list
    if (unchecked.length > 0) {
      await supabase
        .from("shopping_items")
        .update({ list_id: newList.id, completed: false, completed_by: null, completed_at: null })
        .in("id", unchecked.map((i) => i.id));
    }

    // Update local state
    const carried = unchecked.map((i) => ({ ...i, list_id: newList.id, completed: false, completed_by: null, completed_at: null }));
    setItems(carried);
    setActiveListId(newList.id);
    setPastLists((prev) => [{ ...newList, id: archivedListId, archived_at: now, name: tripName() }, ...prev]);
    setFinishing(false);
    return archivedListId;
  }

  const activeItems = items.filter((i) => !i.completed);
  const completedItems = items.filter((i) => i.completed);

  return {
    activeListId,
    activeItems,
    completedItems,
    pastLists,
    loading,
    finishing,
    addItem,
    updateItem,
    toggleComplete,
    deleteItem,
    finishTrip,
  };
}
