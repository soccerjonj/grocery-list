"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface MemberProfile {
  user_id: string;
  display_name: string;
  role: string;
  /** First name or first word of display_name for compact display */
  short_name: string;
  /** Two-letter initials */
  initials: string;
  /** Hex color chosen by the member, or null */
  color: string | null;
}

export function useHouseholdMembers(householdId: string) {
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function fetchMembers() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);

      const { data: memberRows, error: memberErr } = await supabase
        .from("household_members")
        .select("user_id, role")
        .eq("household_id", householdId);

      if (memberErr) {
        // Don't blank the members list on a transient fetch failure —
        // keep what we had and surface the error instead.
        console.error("fetchMembers failed:", memberErr.message);
        setLoadError(memberErr.message || "Couldn't load members");
        setLoading(false);
        return;
      }

      if (!memberRows?.length) {
        setLoading(false);
        return;
      }

      const { data: profiles, error: profilesErr } = await supabase
        .from("profiles")
        .select("id, display_name, color")
        .in(
          "id",
          memberRows.map((m) => m.user_id)
        );
      if (profilesErr) {
        console.error("fetchMembers (profiles) failed:", profilesErr.message);
        setLoadError(profilesErr.message || "Couldn't load member profiles");
        setLoading(false);
        return;
      }

      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.id, { display_name: p.display_name, color: p.color }])
      );

      const built = memberRows.map((m) => {
        const prof = profileMap.get(m.user_id);
        const name = prof?.display_name || "Unknown";
        const parts = name.trim().split(/\s+/);
        const short = parts[0] || name;
        const initials =
          parts.length >= 2
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : name.slice(0, 2).toUpperCase();
        return {
          user_id: m.user_id,
          role: m.role,
          display_name: name,
          short_name: short,
          initials,
          color: prof?.color ?? null,
        };
      });

      setMembers(built);

      // Track current user's role (reuse user fetched above)
      const myRow = memberRows.find((m) => m.user_id === user?.id);
      setCurrentUserRole(myRow?.role ?? null);

      setLoading(false);
    }

    fetchMembers();
  }, [householdId, supabase]);

  async function removeMember(userId: string) {
    const idx = members.findIndex((m) => m.user_id === userId);
    if (idx < 0) return;
    const snapshot = members[idx];
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    const { error } = await supabase
      .from("household_members")
      .delete()
      .eq("household_id", householdId)
      .eq("user_id", userId);
    if (error) {
      console.error("removeMember failed:", error.message);
      setMembers((prev) => {
        if (prev.some((m) => m.user_id === userId)) return prev;
        const next = [...prev];
        next.splice(Math.min(idx, next.length), 0, snapshot);
        return next;
      });
    }
  }

  return { members, currentUserId, currentUserRole, loading, loadError, removeMember };
}
