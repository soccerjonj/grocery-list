"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHouseholdContext } from "@/context/HouseholdContext";

export default function MembersRedirect() {
  const { householdId } = useHouseholdContext();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/household/${householdId}/settings`);
  }, [householdId, router]);

  return null;
}
