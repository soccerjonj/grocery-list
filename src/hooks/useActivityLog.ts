"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ActivityLog } from "@/types/database";

const LAST_SEEN_KEY = (householdId: string) => `activity_last_seen_${householdId}`;
const LIMIT = 40;

export function useActivityLog(householdId: string, currentUserId?: string | null) {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = createClient();

  const computeUnread = useCallback((items: ActivityLog[]) => {
    if (typeof window === "undefined") return;
    const others = items.filter((a) => !currentUserId || a.user_id !== currentUserId);
    const raw = localStorage.getItem(LAST_SEEN_KEY(householdId));
    if (!raw) { setUnreadCount(others.length); return; }
    const lastSeen = new Date(raw).getTime();
    setUnreadCount(others.filter((a) => new Date(a.created_at).getTime() > lastSeen).length);
  }, [householdId, currentUserId]);

  const fetchActivities = useCallback(async () => {
    try {
      // Clean up stale/duplicate running_low notifications first
      await supabase.rpc("cleanup_stale_activity", { p_household_id: householdId }).catch(() => {});
      const { data } = await supabase
        .from("activity_log")
        .select("*")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      const items = data ?? [];
      setActivities(items);
      computeUnread(items);
    } catch {
      // table may not exist yet — fail silently
    } finally {
      setLoading(false);
    }
  }, [householdId, supabase, computeUnread]);

  useEffect(() => {
    fetchActivities();

    const channel = supabase
      .channel(`activity-${householdId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log", filter: `household_id=eq.${householdId}` },
        (payload) => {
          const newItem = payload.new as ActivityLog;
          setActivities((prev) => {
            if (prev.some((a) => a.id === newItem.id)) return prev;
            const updated = [newItem, ...prev].slice(0, LIMIT);
            computeUnread(updated);
            return updated;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [householdId, fetchActivities, supabase, computeUnread]);

  function markAllRead() {
    if (typeof window !== "undefined") {
      localStorage.setItem(LAST_SEEN_KEY(householdId), new Date().toISOString());
    }
    setUnreadCount(0);
  }

  return { activities, loading, unreadCount, markAllRead };
}
