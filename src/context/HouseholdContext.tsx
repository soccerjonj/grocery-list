"use client";

import { createContext, useContext } from "react";

interface HouseholdContextValue {
  householdId: string;
  householdName: string;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({
  children,
  householdId,
  householdName,
}: {
  children: React.ReactNode;
  householdId: string;
  householdName: string;
}) {
  return (
    <HouseholdContext.Provider value={{ householdId, householdName }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHouseholdContext() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHouseholdContext must be inside HouseholdProvider");
  return ctx;
}
