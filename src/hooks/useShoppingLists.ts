"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ShoppingList } from "@/types/database";

export function useShoppingLists(householdId: string) {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchLists = useCallback(async () => {
    const { data, error } = await supabase
      .from("shopping_lists")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });
    if (error) {
      // Don't overwrite a populated list with [] on transient failure —
      // keep the user's last-known state and surface the error instead.
      console.error("fetchLists failed:", error.message);
      setLoadError(error.message || "Couldn't load shopping lists");
    } else {
      setLists(data ?? []);
      setLoadError(null);
    }
    setLoading(false);
  }, [householdId, supabase]);

  useEffect(() => {
    fetchLists();

    const channel = supabase
      .channel(`shopping-lists-${householdId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shopping_lists",
          filter: `household_id=eq.${householdId}`,
        },
        () => fetchLists()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, fetchLists, supabase]);

  async function createList(name: string): Promise<string | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const id = crypto.randomUUID();
    const row: ShoppingList = {
      id,
      household_id: householdId,
      name: name.trim(),
      created_by: user?.id ?? null,
      created_at: new Date().toISOString(),
      archived_at: null,
    };
    // Optimistically insert so it appears immediately
    setLists((prev) => [row, ...prev]);
    const { error } = await supabase.from("shopping_lists").insert({
      id,
      household_id: householdId,
      name: row.name,
      created_by: row.created_by,
    });
    if (error) {
      console.error("createList failed:", error.message);
      setLists((prev) => prev.filter((l) => l.id !== id));
      return null;
    }
    return id;
  }

  async function archiveList(id: string) {
    const snapshot = lists.find((l) => l.id === id);
    if (!snapshot) return;
    const now = new Date().toISOString();
    setLists((prev) =>
      prev.map((l) => (l.id === id ? { ...l, archived_at: now } : l))
    );
    const { error } = await supabase
      .from("shopping_lists")
      .update({ archived_at: now })
      .eq("id", id);
    if (error) {
      console.error("archiveList failed:", error.message);
      setLists((prev) => prev.map((l) => (l.id === id ? snapshot : l)));
    }
  }

  async function unarchiveList(id: string) {
    const snapshot = lists.find((l) => l.id === id);
    if (!snapshot) return;
    setLists((prev) =>
      prev.map((l) => (l.id === id ? { ...l, archived_at: null } : l))
    );
    const { error } = await supabase
      .from("shopping_lists")
      .update({ archived_at: null })
      .eq("id", id);
    if (error) {
      // Most likely cause: migration 017's partial unique index — there's
      // already an active list for this household. Roll back so the UI
      // matches reality and the user can dismiss-then-retry.
      console.error("unarchiveList failed:", error.message);
      setLists((prev) => prev.map((l) => (l.id === id ? snapshot : l)));
    }
  }

  async function deleteList(id: string) {
    const idx = lists.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const snapshot = lists[idx];
    setLists((prev) => prev.filter((l) => l.id !== id));
    const { error } = await supabase.from("shopping_lists").delete().eq("id", id);
    if (error) {
      console.error("deleteList failed:", error.message);
      setLists((prev) => {
        if (prev.some((l) => l.id === id)) return prev;
        const next = [...prev];
        next.splice(Math.min(idx, next.length), 0, snapshot);
        return next;
      });
    }
  }

  const activeLists = lists.filter((l) => !l.archived_at);
  const pastLists = lists.filter((l) => !!l.archived_at);

  return {
    lists,
    activeLists,
    pastLists,
    loading,
    loadError,
    createList,
    archiveList,
    unarchiveList,
    deleteList,
  };
}
