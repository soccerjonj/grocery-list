"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ShoppingList } from "@/types/database";

export function useShoppingLists(householdId: string) {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchLists = useCallback(async () => {
    const { data } = await supabase
      .from("shopping_lists")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });
    setLists(data ?? []);
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
    const { error } = await supabase.from("shopping_lists").insert({
      id,
      household_id: householdId,
      name: name.trim(),
      created_by: user?.id ?? null,
    });
    if (error) return null;
    // Optimistically add so it appears immediately
    setLists((prev) => [
      {
        id,
        household_id: householdId,
        name: name.trim(),
        created_by: user?.id ?? null,
        created_at: new Date().toISOString(),
        archived_at: null,
      },
      ...prev,
    ]);
    return id;
  }

  async function archiveList(id: string) {
    const now = new Date().toISOString();
    setLists((prev) =>
      prev.map((l) => (l.id === id ? { ...l, archived_at: now } : l))
    );
    await supabase
      .from("shopping_lists")
      .update({ archived_at: now })
      .eq("id", id);
  }

  async function unarchiveList(id: string) {
    setLists((prev) =>
      prev.map((l) => (l.id === id ? { ...l, archived_at: null } : l))
    );
    await supabase
      .from("shopping_lists")
      .update({ archived_at: null })
      .eq("id", id);
  }

  async function deleteList(id: string) {
    setLists((prev) => prev.filter((l) => l.id !== id));
    await supabase.from("shopping_lists").delete().eq("id", id);
  }

  const activeLists = lists.filter((l) => !l.archived_at);
  const pastLists = lists.filter((l) => !!l.archived_at);

  return {
    lists,
    activeLists,
    pastLists,
    loading,
    createList,
    archiveList,
    unarchiveList,
    deleteList,
  };
}
