"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ShoppingItem, ShoppingList } from "@/types/database";
import { logActivity } from "@/lib/logActivity";
import { getPantryHint } from "@/lib/pantryHints";

function tripName() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function useShoppingFlow(householdId: string) {
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [pastLists, setPastLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  // When init fails, we surface an error so the UI can show a "Couldn't
  // load — retry" banner instead of silently rendering an empty list
  // (which looks identical to data loss and has caused real user panic).
  const [loadError, setLoadError] = useState<string | null>(null);
  const selfInsertedIds = useRef<Set<string>>(new Set());
  const supabase = createClient();

  // ── Bootstrap: find or create the active list ─────────────────
  const init = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    // Race-safe atomic primitive (see migration 017). Replaces the previous
    // SELECT-then-INSERT pattern that could create a duplicate non-archived
    // list when the SELECT failed transiently — that bug orphaned an entire
    // household's items on the older list once the duplicate appeared.
    const { data: listId, error: rpcErr } = await supabase
      .rpc("get_or_create_active_shopping_list", { p_household_id: householdId });

    if (rpcErr || !listId) {
      console.error("Failed to get active shopping list:", rpcErr?.message);
      setLoadError(rpcErr?.message || "Couldn't load your shopping list");
      setLoading(false);
      return;
    }

    setActiveListId(listId);

    const { data: itemData, error: itemsErr } = await supabase
      .from("shopping_items")
      .select("*")
      .eq("list_id", listId)
      .is("cleared_at", null)
      .order("created_at", { ascending: true });
    if (itemsErr) {
      // Don't overwrite a stale items list with [] on a transient fetch
      // failure. Preserving prior state means the user keeps seeing what
      // they had instead of an alarming "empty list" flash.
      console.error("Failed to fetch shopping items:", itemsErr.message);
      setLoadError(itemsErr.message || "Couldn't load your shopping list");
    } else {
      setItems(itemData ?? []);
    }

    // Fetch past trips (non-critical — failure here doesn't surface as an error)
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
    assignedTo?: string[] | null,
    notes?: string,
    kind?: string
  ) {
    if (!activeListId) return;
    const { data: { user } } = await supabase.auth.getUser();
    // Caller can override kind explicitly (e.g. running-low → shopping carries
    // the pantry item's kind through). Otherwise fall back to a name-based hint
    // so toilet paper / cat food / toothpaste auto-route to Supplies on import.
    const resolvedKind = kind ?? getPantryHint(name)?.kind ?? "food";

    const optimistic: ShoppingItem = {
      id: `temp-${Date.now()}`,
      household_id: householdId,
      list_id: activeListId,
      name,
      quantity: quantity ?? null,
      unit: unit ?? null,
      store: store ?? null,
      notes: notes ?? null,
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

    const { data, error } = await supabase
      .from("shopping_items")
      .insert({
        household_id: householdId,
        list_id: activeListId,
        name,
        quantity: quantity ?? null,
        unit: unit ?? null,
        store: store ?? null,
        notes: notes ?? null,
        added_by: user?.id ?? null,
        assigned_to: assignedTo ?? null,
        kind: resolvedKind,
      })
      .select()
      .single();

    if (error) {
      console.error("shopping addItem failed:", error.message, error.details);
      setItems((prev) => prev.filter((i) => i.id !== optimistic.id));
    } else if (data) {
      selfInsertedIds.current.add(data.id);
      setTimeout(() => selfInsertedIds.current.delete(data.id), 5000);
      setItems((prev) => {
        const deduped = prev.filter((i) => i.id !== data.id);
        return deduped.map((i) => (i.id === optimistic.id ? data : i));
      });
      logActivity(householdId, "shopping_add", name);
    }
  }

  async function updateItem(
    id: string,
    fields: Partial<Pick<ShoppingItem, "name" | "quantity" | "unit" | "store" | "notes" | "assigned_to">>
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
    // Snapshot for rollback in case the DB write fails.
    const snapshot = item;

    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, completed, completed_by: completed ? (user?.id ?? null) : null, completed_at: completed ? now : null }
          : i
      )
    );

    const { error } = await supabase.from("shopping_items").update({
      completed,
      completed_by: completed ? user?.id : null,
      completed_at: completed ? now : null,
    }).eq("id", id);

    if (error) {
      // Rollback so the user sees the actual DB state, not a phantom toggle.
      console.error("shopping toggleComplete failed:", error.message);
      setItems((prev) => prev.map((i) => (i.id === id ? snapshot : i)));
      return;
    }

    if (completed) logActivity(householdId, "shopping_check", item.name);
  }

  async function deleteItem(id: string) {
    // Snapshot for rollback. We capture both the item and its index so the
    // restored order matches what the user saw before they tapped delete.
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const snapshot = items[idx];

    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error } = await supabase.from("shopping_items").delete().eq("id", id);
    if (error) {
      console.error("shopping deleteItem failed:", error.message);
      setItems((prev) => {
        // Skip if it's somehow already back (realtime echo, retry race)
        if (prev.some((i) => i.id === id)) return prev;
        const next = [...prev];
        next.splice(Math.min(idx, next.length), 0, snapshot);
        return next;
      });
    }
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

    // Atomic finish: archive current list, create new list, move unchecked
    // items — all in one transaction via migration 018's RPC. Previously
    // these were three separate round-trips; a partial failure could
    // orphan items split across two lists with one of them already
    // archived (invisible). Now it's all-or-nothing at the DB level.
    const { data: newListId, error: rpcErr } = await supabase
      .rpc("finish_shopping_trip", { p_list_id: activeListId, p_trip_name: tripName() });

    if (rpcErr || !newListId) {
      console.error("Failed to finish trip:", rpcErr?.message);
      setFinishing(false);
      return null;
    }

    // Update local state
    const carried = unchecked.map((i) => ({ ...i, list_id: newListId, completed: false, completed_by: null, completed_at: null }));
    setItems(carried);
    setActiveListId(newListId);
    // Synthesize a past-list entry for the archived trip so it appears in
    // the "Past trips" list immediately without a refetch.
    setPastLists((prev) => [
      { id: archivedListId, household_id: householdId, name: tripName(), created_at: now, archived_at: now, created_by: null },
      ...prev,
    ]);
    logActivity(householdId, "trip_finished");
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
    loadError,
    retry: init,
    addItem,
    updateItem,
    toggleComplete,
    deleteItem,
    finishTrip,
  };
}
