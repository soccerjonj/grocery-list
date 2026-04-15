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
}

export function useHouseholdMembers(householdId: string) {
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
        .select("id, display_name")
        .in(
          "id",
          memberRows.map((m) => m.user_id)
        );

      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.id, p.display_name])
      );

      setMembers(
        memberRows.map((m) => {
          const name = profileMap.get(m.user_id) || "Unknown";
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
          };
        })
      );
      setLoading(false);
    }

    fetchMembers();
  }, [householdId, supabase]);

  return { members, currentUserId, loading };
}
