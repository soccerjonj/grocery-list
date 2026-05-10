"use client";

import { createContext, useContext } from "react";
import { usePantry } from "@/hooks/usePantry";
import { useShoppingFlow } from "@/hooks/useShoppingFlow";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";

/**
 * Lifts the three big household-scoped data hooks into the household layout
 * so they outlive tab switches between Pantry and Shopping.
 *
 * Without this, navigating Pantry → Shopping → Pantry remounts every hook,
 * which means new Supabase fetches + new Realtime subscriptions every time.
 * With this, the hooks mount once when the user enters the household and
 * stay alive until they leave — tab switches just re-read the same context
 * value and render instantly.
 */

type PantryData = ReturnType<typeof usePantry>;
type ShoppingData = ReturnType<typeof useShoppingFlow>;
type MembersData = ReturnType<typeof useHouseholdMembers>;

interface HouseholdDataValue {
  pantry: PantryData;
  shopping: ShoppingData;
  members: MembersData;
}

const HouseholdDataContext = createContext<HouseholdDataValue | null>(null);

export function HouseholdDataProvider({
  children,
  householdId,
}: {
  children: React.ReactNode;
  householdId: string;
}) {
  // All three run in parallel; their effects are independent. Realtime
  // subscriptions are reference-counted by Supabase so this is safe even
  // if a child component also tries to subscribe to the same channels.
  const pantry = usePantry(householdId);
  const shopping = useShoppingFlow(householdId);
  const members = useHouseholdMembers(householdId);

  return (
    <HouseholdDataContext.Provider value={{ pantry, shopping, members }}>
      {children}
    </HouseholdDataContext.Provider>
  );
}

export function useHouseholdData() {
  const ctx = useContext(HouseholdDataContext);
  if (!ctx) {
    throw new Error("useHouseholdData must be used inside HouseholdDataProvider");
  }
  return ctx;
}
