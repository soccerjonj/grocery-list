"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { usePantry } from "@/hooks/usePantry";
import { useShoppingFlow } from "@/hooks/useShoppingFlow";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import { useHouseholdRecipes } from "@/hooks/useHouseholdRecipes";

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
type RecipesData = ReturnType<typeof useHouseholdRecipes>;

interface HouseholdDataValue {
  pantry: PantryData;
  shopping: ShoppingData;
  members: MembersData;
  recipes: RecipesData;
}

const HouseholdDataContext = createContext<HouseholdDataValue | null>(null);

export function HouseholdDataProvider({
  children,
  householdId,
}: {
  children: React.ReactNode;
  householdId: string;
}) {
  // All four run in parallel; their effects are independent. Realtime
  // subscriptions are reference-counted by Supabase so this is safe even
  // if a child component also tries to subscribe to the same channels.
  const pantry = usePantry(householdId);
  const shopping = useShoppingFlow(householdId);
  const members = useHouseholdMembers(householdId);
  const recipes = useHouseholdRecipes(householdId);

  // Resync when the app returns to the foreground or regains connectivity.
  // Mobile browsers freeze/close the realtime websocket while backgrounded
  // (screen lock between aisles), and even with the reconnect-refetch in each
  // hook, this is the belt-and-suspenders that guarantees the list is current
  // the instant you look at your phone again — no manual pull-to-refresh.
  const lastResync = useRef(0);
  useEffect(() => {
    function resync() {
      const now = Date.now();
      if (now - lastResync.current < 2000) return; // debounce double-fires
      lastResync.current = now;
      shopping.retry();
      pantry.refetch();
    }
    function onVisible() {
      if (document.visibilityState === "visible") resync();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", resync);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", resync);
    };
    // shopping.retry / pantry.refetch are stable useCallbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  return (
    <HouseholdDataContext.Provider value={{ pantry, shopping, members, recipes }}>
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
