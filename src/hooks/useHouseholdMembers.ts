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
  const supabase = createClient();

  useEffect(() => {
    async function fetchMembers() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);

      const { data: memberRows } = await supabase
        .from("household_members")
        .select("user_id, role")
        .eq("household_id", householdId);

      if (!memberRows?.length) {
        setLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, color")
        .in(
          "id",
          memberRows.map((m) => m.user_id)
        );

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
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    await supabase
      .from("household_members")
      .delete()
      .eq("household_id", householdId)
      .eq("user_id", userId);
  }

  return { members, currentUserId, currentUserRole, loading, removeMember };
}
